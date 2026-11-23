#!/usr/bin/env python3
"""Start Foldframe (AiToEarn stack + macOS Host Local Bridge for agy/codex/dreamina)."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
LOCAL = ROOT / ".local-run"
BRIDGE_SCRIPT = ROOT / "scripts" / "local-bridge.mjs"
BRIDGE_PID = LOCAL / "bridge.pid"
BRIDGE_LOG = LOCAL / "bridge.log"
SKILLS_DIR = ROOT / "project/aitoearn-backend/apps/aitoearn-ai/src/core/agent/skills"
COMPOSE = ["docker", "compose", "-p", "aitoearn", "--env-file", str(LOCAL / "env"),
           "-f", "docker-compose.yml", "-f", "scripts/compose.local.yaml"]


def find_node():
    for candidate in (shutil.which("node"), "/opt/homebrew/bin/node", "/usr/local/bin/node"):
        if candidate and os.access(candidate, os.X_OK):
            return candidate
    return None


def initialize():
    if LOCAL.exists():
        return
    web = int(os.environ.get("AITO_WEB_PORT", 8080))
    upload = int(os.environ.get("AITO_UPLOAD_PORT", 9000))
    bridge = int(os.environ.get("AITO_BRIDGE_PORT", 18787))
    if len({web, upload, bridge}) != 3 or any(port < 1 or port > 65535 for port in (web, upload, bridge)):
        raise ValueError("Web、上传与本机桥接端口需要设置为三个不同的有效端口。")
    jwt, internal, s3, bridge_token = (secrets.token_hex(32) for _ in range(4))
    with tempfile.TemporaryDirectory(prefix=".local-run-", dir=ROOT) as tmp:
        config_dir = Path(tmp) / "config"
        config_dir.mkdir(mode=0o700)
        (config_dir / "env").write_text(
            f"JWT_SECRET={jwt}\n"
            f"LOCAL_S3_SECRET={s3}\n"
            f"LOCAL_WEB_PORT={web}\n"
            f"LOCAL_UPLOAD_PORT={upload}\n"
            f"LOCAL_BRIDGE_PORT={bridge}\n"
            f"LOCAL_BRIDGE_TOKEN={bridge_token}\n"
            f"FOLDFRAME_HOST_SKILLS_DIR={SKILLS_DIR}\n"
        )
        for name in ("server", "ai"):
            template = ROOT / f"project/aitoearn-backend/apps/aitoearn-{name}/config/config.yaml"
            config = template.read_text()
            fields = {"  secret: ''": f"  secret: '{jwt}'",
                      "  internalToken: ''": f"  internalToken: '{internal}'",
                      "  secretAccessKey: rustfsadmin": f"  secretAccessKey: '{s3}'"}
            if name == "server":
                fields["  token: ''"] = f"  token: '{internal}'"
            for original, value in fields.items():
                needle = "\n" + original + "\n"
                if config.count(needle) != 1:
                    raise ValueError(f"{template} 中 {original.split(':')[0].strip()} 模板字段已变更。")
                config = config.replace(needle, "\n" + value + "\n")
            config = config.replace("http://localhost:9000", f"http://localhost:{upload}")
            config = config.replace("http://localhost:8080/", f"http://localhost:{web}/")
            config = config.replace("https://localhost/", f"http://localhost:{web}/")
            (config_dir / f"{name}.yaml").write_text(config)
        try:
            config_dir.rename(LOCAL)
        except OSError:
            if not LOCAL.is_dir():
                raise


def load_and_upgrade_env():
    env_path = LOCAL / "env"
    lines = [line for line in env_path.read_text().splitlines() if line.strip() and "=" in line]
    env = dict(line.split("=", 1) for line in lines)
    changed = False
    defaults = {
        "LOCAL_BRIDGE_PORT": os.environ.get("AITO_BRIDGE_PORT", "18787"),
        "LOCAL_BRIDGE_TOKEN": secrets.token_hex(32),
        "FOLDFRAME_HOST_SKILLS_DIR": str(SKILLS_DIR),
    }
    for key, value in defaults.items():
        if not env.get(key):
            env[key] = value
            changed = True
    if changed:
        env_path.write_text("".join(f"{k}={v}\n" for k, v in env.items()))
    return env


def bridge_health(port):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f"http://127.0.0.1:{port}/health", timeout=2) as response:
            if response.status == 200:
                return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None
    return None


def bridge_engines(port, token):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/engines",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with opener.open(req, timeout=8) as response:
            if response.status == 200:
                return json.loads(response.read().decode("utf-8")).get("engines")
    except Exception:
        return None
    return None


def stop_bridge():
    if not BRIDGE_PID.exists():
        return
    try:
        pid = int(BRIDGE_PID.read_text().strip())
        os.kill(pid, signal.SIGTERM)
        for _ in range(15):
            try:
                os.kill(pid, 0)
                time.sleep(0.1)
            except ProcessLookupError:
                break
    except (ValueError, ProcessLookupError, PermissionError):
        pass
    finally:
        try:
            BRIDGE_PID.unlink(missing_ok=True)
        except OSError:
            pass


def start_bridge(env):
    if not BRIDGE_SCRIPT.exists():
        print("提示：未找到 scripts/local-bridge.mjs，跳过本机桥接服务。", flush=True)
        return
    port = env["LOCAL_BRIDGE_PORT"]
    token = env["LOCAL_BRIDGE_TOKEN"]
    health = bridge_health(port)
    if health and health.get("ok"):
        if bridge_engines(port, token) is not None:
            print(f"本机模型桥接已就绪：http://127.0.0.1:{port} (pid {health.get('pid')})", flush=True)
            return
        stop_bridge()

    node_bin = find_node()
    if not node_bin:
        print("警告：本机未检测到 Node.js，无法启动 agy/codex/dreamina 本机桥接服务。", file=sys.stderr, flush=True)
        return

    bridge_env = os.environ.copy()
    bridge_env.update({
        "LOCAL_BRIDGE_HOST": "127.0.0.1",
        "LOCAL_BRIDGE_PORT": port,
        "LOCAL_BRIDGE_TOKEN": token,
        "LOCAL_WEB_PORT": env["LOCAL_WEB_PORT"],
        "FOLDFRAME_SKILLS_DIR": env["FOLDFRAME_HOST_SKILLS_DIR"],
        "FOLDFRAME_DATA_DIR": str(LOCAL / "bridge"),
    })
    with open(BRIDGE_LOG, "ab") as log_file:
        proc = subprocess.Popen(
            [node_bin, str(BRIDGE_SCRIPT)],
            cwd=str(ROOT),
            env=bridge_env,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=log_file,
            start_new_session=True,
        )
    BRIDGE_PID.write_text(str(proc.pid))
    for _ in range(30):
        if bridge_health(port):
            print(f"本机模型桥接已启动：http://127.0.0.1:{port} (pid {proc.pid})", flush=True)
            return
        time.sleep(0.2)
    print(f"警告：本机模型桥接启动超时，请查看日志 {BRIDGE_LOG}", file=sys.stderr, flush=True)


def engine_ready():
    return subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL).returncode == 0


def start_engine():
    if engine_ready():
        return
    print("正在启动 Docker Desktop…", flush=True)
    subprocess.run(["docker", "desktop", "start", "--detach"], check=True)
    for _ in range(60):
        if engine_ready():
            return
        time.sleep(2)
    raise RuntimeError("Docker 引擎尚未就绪，请检查 Docker Desktop。")


def main():
    parser = argparse.ArgumentParser(description="启动 Foldframe 本地工作台。首次配置可使用 AITO_WEB_PORT、AITO_UPLOAD_PORT 和 AITO_BRIDGE_PORT。")
    options = parser.add_mutually_exclusive_group()
    options.add_argument("--prepare", action="store_true", help="创建并校验配置")
    options.add_argument("--start", action="store_true", help="启动服务，跳过自动打开浏览器")
    options.add_argument("--status", action="store_true", help="查看所有容器与本机桥接状态")
    options.add_argument("--stop", action="store_true", help="停止服务与本机桥接，保留数据")
    args = parser.parse_args()
    os.chdir(ROOT)
    os.umask(0o077)
    initialize()
    env = load_and_upgrade_env()
    # Give this instance's values precedence over unrelated shell variables.
    os.environ.update(env)
    subprocess.run([*COMPOSE, "config", "--quiet"], check=True)
    if args.prepare:
        print(f"本地配置已就绪：{LOCAL}")
        return
    if args.stop:
        stop_bridge()
        subprocess.run([*COMPOSE, "stop"], check=True)
        return
    if args.status:
        port = env["LOCAL_BRIDGE_PORT"]
        health = bridge_health(port)
        if health and health.get("ok"):
            print(f"本机模型桥接：运行中 (http://127.0.0.1:{port}, pid {health.get('pid')})")
            engines = bridge_engines(port, env["LOCAL_BRIDGE_TOKEN"])
            if engines:
                for key in ("agy", "codex", "dreamina", "grok", "workbuddy"):
                    item = engines.get(key, {})
                    state = "已就绪" if item.get("installed") or item.get("running") else "未安装"
                    extra = ""
                    if key in ("dreamina", "grok", "workbuddy") and item.get("installed"):
                        extra = f" / {'已登录' if item.get('loggedIn') else '未登录'}"
                    print(f"  - {item.get('name', key)}: {state}{extra}")
        else:
            print(f"本机模型桥接：未运行 (端口 {port})")
        subprocess.run([*COMPOSE, "ps", "--all"], check=True)
        return
    start_bridge(env)
    start_engine()
    print("正在启动 Foldframe，首次运行需要下载镜像并构建工作台。", flush=True)
    subprocess.run([*COMPOSE, "up", "-d", "--build", "--pull", "missing", "--wait", "--wait-timeout", "600"], check=True)
    # Refresh nginx upstream DNS in case aitoearn-ai / aitoearn-web containers were recreated with new IPs.
    subprocess.run(
        [*COMPOSE, "exec", "-T", "nginx", "nginx", "-s", "reload"],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://localhost:{env['LOCAL_WEB_PORT']}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(base + "/api/health", timeout=10) as response:
        if response.read(32).strip() != b"OK":
            raise RuntimeError("后端健康检查没有返回 OK。")
    entry = base + "/zh-CN"
    with opener.open(entry, timeout=30) as response:
        if response.status != 200 or response.headers.get_content_type() != "text/html":
            raise RuntimeError("工作台尚未就绪。")
    print(f"Foldframe 已启动：{entry}", flush=True)
    if not args.start:
        subprocess.run(["open", entry], check=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Foldframe 操作失败：{error}", file=sys.stderr)
        sys.exit(1)
