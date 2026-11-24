/**
 * ProfileTab - 账号资料、绑定与安全设置
 * 支持：更换头像、修改昵称、绑定/更换手机号、绑定/更换邮箱、修改登录密码、工作台工具直达
 */

'use client'

import {
  Camera,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  Tv,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { updatePasswordApi, updateUserInfoApi } from '@/api/auth/auth.api'
import { uploadToOss } from '@/api/materials/material.api'
import { useTransClient } from '@/app/i18n/client'
import { useChannelManagerStore } from '@/components/ChannelManager'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { useAccountStore } from '@/store/account'
import { useConfigManagerDialogStore } from '@/store/configManagerDialog'
import { usePluginStore } from '@/store/plugin'
import { PluginStatus } from '@/store/plugin/types/baseTypes'
import { useUserStore } from '@/store/user'
import { cn } from '@/utils/className'
import { getOssUrl } from '@/utils/oss'
import { toast } from '@/utils/ui/toast'
import { AvatarCropModal } from './components/AvatarCropModal'

interface ProfileTabProps {
  onClose: () => void
}

function maskPhone(phone?: string) {
  if (!phone) return ''
  const trimmed = phone.trim()
  if (trimmed.length >= 7) {
    return trimmed.replace(/^(.{3}).*(.{4})$/, '$1****$2')
  }
  return trimmed
}

export function ProfileTab({ onClose }: ProfileTabProps) {
  const { t } = useTransClient('settings')
  const { t: tCommon } = useTransClient('common')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { userInfo, getUserInfo } = useUserStore(
    useShallow(state => ({
      userInfo: state.userInfo,
      getUserInfo: state.getUserInfo,
    })),
  )

  const openConfigDialog = useConfigManagerDialogStore(state => state.openDialog)
  const openChannelManager = useChannelManagerStore(state => state.openModal)
  const accountCount = useAccountStore(state => state.accountList?.length ?? 0)
  const { pluginStatus, openPluginModal } = usePluginStore(
    useShallow(state => ({
      pluginStatus: state.status,
      openPluginModal: state.openPluginModal,
    })),
  )

  // Nickname state
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(userInfo?.name || '')
  const [isSavingName, setIsSavingName] = useState(false)

  // Avatar state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [cropModalOpen, setCropModalOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Phone binding state
  const [isEditingPhone, setIsEditingPhone] = useState(false)
  const [phoneInput, setPhoneInput] = useState(userInfo?.phone || '')
  const [isSavingPhone, setIsSavingPhone] = useState(false)

  // Email binding state
  const [isEditingMail, setIsEditingMail] = useState(false)
  const [mailInput, setMailInput] = useState(userInfo?.mail || '')
  const [isSavingMail, setIsSavingMail] = useState(false)

  // Password change state
  const [isEditingPassword, setIsEditingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  useEffect(() => {
    setEditName(userInfo?.name || '')
    setPhoneInput(userInfo?.phone || '')
    setMailInput(userInfo?.mail || '')
  }, [userInfo?.name, userInfo?.phone, userInfo?.mail])

  const avatarUrl = userInfo?.avatar ? getOssUrl(userInfo.avatar) : ''
  const hasPassword = Boolean(userInfo?.hasPassword)

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.avatarTypeError'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('profile.avatarSizeError'))
      return
    }

    setSelectedFile(file)
    setCropModalOpen(true)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = async (blob: Blob) => {
    setIsUploadingAvatar(true)
    try {
      const file = new File([blob], `avatar_${Date.now()}.png`, { type: 'image/png' })
      const ossPath = await uploadToOss(file)
      const response = await updateUserInfoApi({
        name: userInfo?.name || '',
        avatar: ossPath,
      })

      if (response?.code === 0) {
        await getUserInfo()
        toast.success('头像已更新')
        setCropModalOpen(false)
        setSelectedFile(null)
      }
      else {
        toast.error(response?.message || t('profile.avatarUpdateFailed'))
      }
    }
    catch (error) {
      console.error('头像上传失败:', error)
      toast.error(t('profile.avatarUpdateFailed'))
    }
    finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleSaveName = async () => {
    const trimmed = editName.trim()
    if (!trimmed) {
      toast.error(t('profile.nameRequired'))
      return
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      toast.error(t('profile.nameLengthError'))
      return
    }

    setIsSavingName(true)
    try {
      const response = await updateUserInfoApi({ name: trimmed })
      if (response?.code === 0) {
        await getUserInfo()
        toast.success('昵称已更新')
        setIsEditingName(false)
      }
      else {
        toast.error(response?.message || t('profile.nameUpdateFailed'))
      }
    }
    catch {
      toast.error(t('profile.nameUpdateFailed'))
    }
    finally {
      setIsSavingName(false)
    }
  }

  const handleSavePhone = async () => {
    const cleaned = phoneInput.trim()
    if (!cleaned) {
      toast.error('请输入要绑定的手机号')
      return
    }
    if (!/^[+\d][\d\s-]{5,24}$/.test(cleaned)) {
      toast.error('请输入有效的手机号格式')
      return
    }

    setIsSavingPhone(true)
    try {
      const response = await updateUserInfoApi({ phone: cleaned })
      if (response?.code === 0) {
        await getUserInfo()
        toast.success('手机号绑定已更新')
        setIsEditingPhone(false)
      }
      else {
        toast.error(response?.message || '手机号保存失败')
      }
    }
    catch {
      toast.error('手机号保存失败')
    }
    finally {
      setIsSavingPhone(false)
    }
  }

  const handleSaveMail = async () => {
    const cleaned = mailInput.trim()
    if (!cleaned) {
      toast.error('请输入要绑定的邮箱地址')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      toast.error('请输入有效的邮箱格式')
      return
    }

    setIsSavingMail(true)
    try {
      const response = await updateUserInfoApi({ mail: cleaned })
      if (response?.code === 0) {
        await getUserInfo()
        toast.success('邮箱绑定已更新')
        setIsEditingMail(false)
      }
      else {
        toast.error(response?.message || '邮箱保存失败')
      }
    }
    catch {
      toast.error('邮箱保存失败')
    }
    finally {
      setIsSavingMail(false)
    }
  }

  const handleSavePassword = async () => {
    if (hasPassword && !currentPassword) {
      toast.error('请输入当前登录密码')
      return
    }
    if (newPassword.length < 6) {
      toast.error('新密码长度至少为 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }

    setIsSavingPassword(true)
    try {
      const response = await updatePasswordApi({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      })
      if (response?.code === 0) {
        await getUserInfo()
        toast.success(hasPassword ? '登录密码已修改' : '登录密码已设置')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setIsEditingPassword(false)
      }
      else {
        toast.error(response?.message || '修改密码失败')
      }
    }
    catch {
      toast.error('修改密码失败，请检查当前密码是否正确')
    }
    finally {
      setIsSavingPassword(false)
    }
  }

  const pluginReady = pluginStatus === PluginStatus.READY

  return (
    <div className="w-full space-y-5" data-testid="account-profile-panel">
      {/* 1. 头像与基本信息卡片 */}
      <section className="rounded-2xl border border-border/80 bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="group relative shrink-0 cursor-pointer" onClick={handleAvatarClick}>
            <Avatar className="h-16 w-16 border-2 border-background shadow-sm">
              <AvatarImage src={avatarUrl} alt={userInfo?.name || ''} />
              <AvatarFallback className="bg-gradient-back text-lg font-semibold text-white">
                {userInfo?.name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center rounded-full bg-black/50 transition-opacity',
                isUploadingAvatar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            >
              {isUploadingAvatar ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera size={18} className="text-white" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            {isEditingName ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="h-8 max-w-[220px] text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveName()
                    if (e.key === 'Escape') {
                      setIsEditingName(false)
                      setEditName(userInfo?.name || '')
                    }
                  }}
                />
                <Button size="sm" className="h-8 text-xs" onClick={() => void handleSaveName()} disabled={isSavingName}>
                  {isSavingName ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                  保存
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setIsEditingName(false)
                    setEditName(userInfo?.name || '')
                  }}
                >
                  取消
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-semibold text-foreground">
                  {userInfo?.name || tCommon('unknownUser')}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <Pencil className="h-3 w-3" />
                  改昵称
                </button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              支持 JPG / PNG / WebP（5MB 内），上传后可自由裁剪头像
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="account-change-avatar-btn"
            onClick={handleAvatarClick}
            disabled={isUploadingAvatar}
            className="h-8 shrink-0 gap-1.5 rounded-xl text-xs"
          >
            <Camera className="h-3.5 w-3.5" />
            更换头像
          </Button>
        </div>
      </section>

      {/* 2. 联系方式与账号安全（绑定手机 / 绑定邮箱 / 修改密码） */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card">
        <div className="border-b border-border/70 bg-muted/25 px-4 py-2.5">
          <h4 className="text-xs font-semibold text-foreground">账号绑定与安全</h4>
        </div>

        <div className="divide-y divide-border/70">
          {/* 绑定手机 */}
          <div className="px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600">
                  <Phone className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">绑定手机</div>
                  <div className="truncate text-xs text-muted-foreground" data-testid="account-phone-value">
                    {userInfo?.phone ? maskPhone(userInfo.phone) : '未绑定手机号'}
                  </div>
                </div>
              </div>
              {!isEditingPhone && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="account-bind-phone-btn"
                  onClick={() => {
                    setPhoneInput(userInfo?.phone || '')
                    setIsEditingPhone(true)
                  }}
                  className="h-7.5 rounded-lg text-xs"
                >
                  {userInfo?.phone ? '更换手机' : '绑定手机'}
                </Button>
              )}
            </div>

            {isEditingPhone && (
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-11">
                <Input
                  type="tel"
                  data-testid="account-phone-input"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="请输入 11 位手机号，如 13800138000"
                  className="h-8 max-w-[260px] text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  data-testid="account-phone-save-btn"
                  disabled={isSavingPhone}
                  onClick={() => void handleSavePhone()}
                  className="h-8 text-xs"
                >
                  {isSavingPhone && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  保存绑定
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setIsEditingPhone(false)}>
                  取消
                </Button>
              </div>
            )}
          </div>

          {/* 绑定邮箱 */}
          <div className="px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
                  <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground">绑定邮箱</div>
                  <div className="truncate text-xs text-muted-foreground" data-testid="account-mail-value">
                    {userInfo?.mail || '未绑定邮箱地址'}
                  </div>
                </div>
              </div>
              {!isEditingMail && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="account-bind-mail-btn"
                  onClick={() => {
                    setMailInput(userInfo?.mail || '')
                    setIsEditingMail(true)
                  }}
                  className="h-7.5 rounded-lg text-xs"
                >
                  {userInfo?.mail ? '更换邮箱' : '绑定邮箱'}
                </Button>
              )}
            </div>

            {isEditingMail && (
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-11">
                <Input
                  type="email"
                  data-testid="account-mail-input"
                  value={mailInput}
                  onChange={e => setMailInput(e.target.value)}
                  placeholder="请输入邮箱地址，如 name@company.com"
                  className="h-8 max-w-[260px] text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  data-testid="account-mail-save-btn"
                  disabled={isSavingMail}
                  onClick={() => void handleSaveMail()}
                  className="h-8 text-xs"
                >
                  {isSavingMail && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  保存绑定
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setIsEditingMail(false)}>
                  取消
                </Button>
              </div>
            )}
          </div>

          {/* 登录密码 */}
          <div className="px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  {hasPassword ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <span>登录密码</span>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      hasPassword ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700',
                    )}
                    >
                      {hasPassword ? '已设置' : '未设置'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {hasPassword ? '已启用加密登录密码保护' : '建议设置 6 位以上登录密码提升账号安全'}
                  </div>
                </div>
              </div>
              {!isEditingPassword && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="account-change-password-btn"
                  onClick={() => setIsEditingPassword(true)}
                  className="h-7.5 rounded-lg text-xs"
                >
                  {hasPassword ? '修改密码' : '设置密码'}
                </Button>
              )}
            </div>

            {isEditingPassword && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3.5 sm:ml-11">
                {hasPassword && (
                  <PasswordInput
                    data-testid="account-current-password-input"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="当前登录密码"
                    className="h-8 text-xs"
                  />
                )}
                <PasswordInput
                  data-testid="account-new-password-input"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="新密码（至少 6 位）"
                  className="h-8 text-xs"
                />
                <PasswordInput
                  data-testid="account-confirm-password-input"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="再次确认新密码"
                  className="h-8 text-xs"
                />
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    data-testid="account-password-save-btn"
                    disabled={isSavingPassword}
                    onClick={() => void handleSavePassword()}
                    className="h-8 text-xs"
                  >
                    {isSavingPassword && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    确认保存
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => {
                      setIsEditingPassword(false)
                      setCurrentPassword('')
                      setNewPassword('')
                      setConfirmPassword('')
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. 工作台工具与扩展快捷收纳区（配置管理 / 我的频道 / 浏览器插件） */}
      <section className="space-y-2.5" data-testid="account-workspace-shortcuts">
        <h4 className="text-xs font-semibold text-muted-foreground">工作台配置与扩展</h4>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <button
            type="button"
            data-testid="account-open-config-btn"
            onClick={() => {
              onClose()
              openConfigDialog('sidebar')
            }}
            className="group flex items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] cursor-pointer"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">配置管理</div>
                <div className="truncate text-[11px] text-muted-foreground">运行参数与变量</div>
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
          </button>

          <button
            type="button"
            data-testid="account-open-channels-btn"
            onClick={() => {
              onClose()
              openChannelManager()
            }}
            className="group flex items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] cursor-pointer"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                <Tv className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">我的频道</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {accountCount > 0 ? `已连 ${accountCount} 个账号` : '绑定社媒平台'}
                </div>
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
          </button>

          <button
            type="button"
            data-testid="account-open-plugin-btn"
            onClick={() => {
              onClose()
              openPluginModal()
            }}
            className="group flex items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03] cursor-pointer"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                <Puzzle className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">浏览器插件</div>
                <div className={cn('truncate text-[11px]', pluginReady ? 'text-emerald-600' : 'text-muted-foreground')}>
                  {pluginReady ? '已连接就绪' : '下载 PostPilot 扩展'}
                </div>
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary" />
          </button>
        </div>
      </section>

      {/* 头像裁剪弹窗 */}
      <AvatarCropModal
        open={cropModalOpen}
        onClose={() => {
          setCropModalOpen(false)
          setSelectedFile(null)
        }}
        imageFile={selectedFile}
        onCropComplete={handleCropComplete}
        isUploading={isUploadingAvatar}
      />
    </div>
  )
}
