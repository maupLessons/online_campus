import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { users, studentProfiles, teacherProfiles } from '../common/mock-data';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(login: string, password: string) {
    const user = users.find((u) => u.login === login);
    if (!user) {
      throw new UnauthorizedException('Невірний логін або пароль');
    }

    if (user.status === 'blocked') {
      throw new UnauthorizedException('Обліковий запис заблоковано');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Невірний логін або пароль');
    }

    const payload = { sub: user.id, login: user.login, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    const { passwordHash, ...userWithoutPassword } = user;

    const studentProfile = studentProfiles.find((p) => p.userId === user.id);
    const teacherProfile = teacherProfiles.find((p) => p.userId === user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        ...userWithoutPassword,
        studentProfile: studentProfile || undefined,
        teacherProfile: teacherProfile || undefined,
      },
    };
  }

  async getProfile(userId: string) {
    const user = users.find((u) => u.id === userId);
    if (!user) {
      throw new UnauthorizedException('Користувача не знайдено');
    }

    const { passwordHash, ...userWithoutPassword } = user;
    const studentProfile = studentProfiles.find((p) => p.userId === user.id);
    const teacherProfile = teacherProfiles.find((p) => p.userId === user.id);

    return {
      ...userWithoutPassword,
      studentProfile: studentProfile || undefined,
      teacherProfile: teacherProfile || undefined,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const newPayload = {
        sub: payload.sub,
        login: payload.login,
        role: payload.role,
      };
      return {
        accessToken: this.jwtService.sign(newPayload),
        refreshToken: this.jwtService.sign(newPayload, { expiresIn: '7d' }),
      };
    } catch {
      throw new UnauthorizedException('Невірний refresh token');
    }
  }
}
