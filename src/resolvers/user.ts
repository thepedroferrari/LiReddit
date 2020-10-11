import argon2 from 'argon2';
import { Arg, Ctx, Field, Mutation, ObjectType, Query, Resolver } from "type-graphql";
import { getConnection } from 'typeorm';
import { v4 } from 'uuid';

import { ERROR_CODE, FORGET_PASSWORD_PREFIX, ONE_DAY } from '../constants';
import { User } from '../entities/User';
import { MyContext } from '../types';
import { sendEmail } from '../utils/sendEmail';
import { validateRegister, returnErrors } from '../utils/validateRegister';
import { UsernamePasswordInput } from "./UsernamePasswordInput";

@ObjectType()
class FieldError {
  @Field()
  field: string;
  @Field()
  message: string;
}
@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[]

  @Field(() => User, { nullable: true })
  user?: User
}


@Resolver()
export class UserResolver {
  @Mutation(() => UserResponse)
  async changePassword(
    @Arg('token') token: string,
    @Arg('newPassword') newPassword: string,
    @Ctx() { redis, req }: MyContext
  ): Promise<UserResponse> {
    if (newPassword.length < 6) {
      return { errors: returnErrors('newPassword', 'Your password must be at least 6 characters long') };
    }

    const key = FORGET_PASSWORD_PREFIX + token;
    const userId = await redis.get(key);

    if (!userId) return {
      errors: returnErrors('token', 'Token expired')
    }

    const userIdNum = parseInt(userId);
    const user = await User.findOne(userIdNum)

    if (!user) return {
      errors: returnErrors('token', 'User no longer exists')
    }

    await User.update(
      { id: userIdNum },
      {
        password: await argon2.hash(newPassword)
      }
    )

    // log in user afterwards
    req.session.userId = user.id;

    redis.del(key);

    return { user };
  }

  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg('email') email: string,
    @Ctx() { redis }: MyContext
  ) {
    // If you are going to search by a column that is not the primary key, you have to pass "Where"
    const user = await User.findOne({ where: { email } })
    if (!user) {
      // email is not in the db
      return true
    }

    const token = v4();
    await redis.set(
      FORGET_PASSWORD_PREFIX + token,
      user.id,
      'ex',
      ONE_DAY * 3
    )

    await sendEmail(
      email,
      `<a href="http://localhost:3000/change-password/${token}">reset password</a>`
    );
    return true
  }

  @Query(() => User, { nullable: true })
  me(
    @Ctx() { req }: MyContext
  ) {
    // you are not logged in
    return req.session.userId
      ? User.findOne(req.session.userId)
      : null;
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options);
    if (errors) return { errors };

    const hashedPassword = await argon2.hash(options.password)

    let user;

    try {
      /* Same thing as:
        User.create(
          {
            username: options.username,
            email: options.email,
            password: hashedPassword
          }
        ).save()
      */
      const result = await getConnection()
        .createQueryBuilder()
        .insert()
        .into(User)
        .values([
          {
            username: options.username,
            email: options.email,
            password: hashedPassword
          }
        ])
        .returning('*')
        .execute();
      user = result.raw[0];
    } catch (err) {
      if (err.code = ERROR_CODE.USER_EXIST) {
        return {
          errors: [{
            field: 'username',
            message: 'This username has already been taken.'
          }]
        }
      }
    }

    // login the user
    req.session.userId = user.id;

    return {
      user
    };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("usernameOrEmail") usernameOrEmail: string,
    @Arg("password") password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const user = await User.findOne(
      usernameOrEmail.includes('@')
        ? { where: { email: usernameOrEmail } }
        : { where: { username: usernameOrEmail } }
    );

    if (!user) {
      return {
        errors: [{
          field: 'usernameOrEmail',
          message: 'That username does not exist'
        }]
      }
    }

    const validPwd = await argon2.verify(user.password, password);
    if (!validPwd) {
      return {
        errors: [{
          field: 'password',
          message: 'Incorrect Password'
        }]
      }
    }

    req.session.userId = user.id;

    return {
      user
    };
  }

  @Mutation(() => Boolean)
  logout(
    @Ctx() { req }: MyContext
  ) {
    return new Promise(res => {
      req.session.destroy(err => {
        if (err) {
          console.log(err);
          res(false);
          return;
        }
        res(true);
      })

    })
  }
}
