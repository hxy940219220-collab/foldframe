import type { Locale } from '@yikart/common'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { AppException, ResponseCode } from '@yikart/common'
import { UserAiInfo, UserRepository, UserType } from '@yikart/mongodb'
import { ReportLocationDto, UpdatePasswordDto, UpdateUserInfoDto } from './user.dto'

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
  ) { }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex')
  }

  /**
   * Get user information
   * @param id
   * @returns
   */
  async getUserInfoById(id: string) {
    const res = await this.userRepository.getById(id)
    if (!res)
      throw new AppException(ResponseCode.UserNotFound)

    const { passwordHash, passwordSalt, ...safeUser } = res
    return {
      ...safeUser,
      hasPassword: Boolean(passwordHash && passwordSalt),
    }
  }

  /**
   * Update user information
   * @param id
   * @param newdData
   * @returns
   */
  async updateUserInfo(
    id: string,
    newdData: UpdateUserInfoDto,
  ): Promise<boolean> {
    const updatePayload: Record<string, unknown> = {}
    if (newdData.name !== undefined)
      updatePayload.name = newdData.name.trim()
    if (newdData.avatar !== undefined)
      updatePayload.avatar = newdData.avatar
    if (newdData.phone !== undefined) {
      const cleanedPhone = newdData.phone.trim()
      if (cleanedPhone && !/^[+\d][\d\s-]{5,24}$/.test(cleanedPhone)) {
        throw new AppException(ResponseCode.InvalidParameters, '请输入有效的手机号格式')
      }
      updatePayload.phone = cleanedPhone
    }
    if (newdData.mail !== undefined) {
      const cleanedMail = newdData.mail.trim()
      if (cleanedMail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedMail)) {
        throw new AppException(ResponseCode.InvalidParameters, '请输入有效的邮箱格式')
      }
      updatePayload.mail = cleanedMail
    }

    const res = await this.userRepository.updateById(id, { $set: updatePayload })
    return res !== null
  }

  async updatePassword(
    id: string,
    body: UpdatePasswordDto,
  ): Promise<{ hasPassword: boolean, updatedAt: string }> {
    const rawUser = await this.userRepository.getById(id)
    if (!rawUser)
      throw new AppException(ResponseCode.UserNotFound)

    if (rawUser.passwordHash && rawUser.passwordSalt) {
      if (!body.currentPassword) {
        throw new AppException(ResponseCode.InvalidParameters, '请输入当前登录密码')
      }
      const computed = Buffer.from(this.hashPassword(body.currentPassword, rawUser.passwordSalt), 'hex')
      const stored = Buffer.from(rawUser.passwordHash, 'hex')
      if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) {
        throw new AppException(ResponseCode.InvalidParameters, '当前密码不正确，请重新输入')
      }
    }

    const nextSalt = randomBytes(16).toString('hex')
    const nextHash = this.hashPassword(body.newPassword, nextSalt)
    const now = new Date()
    await this.userRepository.updateById(id, {
      $set: {
        passwordSalt: nextSalt,
        passwordHash: nextHash,
        passwordUpdatedAt: now,
      },
    })

    return { hasPassword: true, updatedAt: now.toISOString() }
  }

  async updateLocation(id: string, data: ReportLocationDto): Promise<boolean> {
    const res = await this.userRepository.updateById(id, { $set: { location: data } })
    return res !== null
  }

  async setAiConfig(userId: string, aiConfig: Partial<UserAiInfo>): Promise<boolean> {
    const res = await this.userRepository.updateAiConfigById(userId, aiConfig)
    return res
  }

  async setAiConfigItem(userId: string, type: 'image' | 'edit' | 'video' | 'agent', value: {
    defaultModel: string
    // eslint-disable-next-line ts/no-explicit-any
    option?: Record<string, any>
  }): Promise<boolean> {
    const res = await this.userRepository.updateAiConfigItemById(userId, type, value)
    return res
  }

  async updateLocale(userId: string, locale: Locale): Promise<boolean> {
    const res = await this.userRepository.updateById(userId, { $set: { locale } })
    return res !== null
  }

  async switchUserType(userId: string, userType: UserType): Promise<boolean> {
    const result = await this.userRepository.updateUserTypeById(userId, userType)
    return result
  }
}
