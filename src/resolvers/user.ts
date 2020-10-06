import argon2 from 'argon2';
import { sendEmail } from 'src/utils/sendEmail';
import { Arg, Ctx, Field, Mutation, ObjectType, Query, Resolver } from "type-graphql";
import { v4 } from 'uuid';

import { ERROR_CODE, FORGET_PASSWORD_PREFIX, ONE_DAY } from '../constants';
import { User } from '../entities/User';
import { MyContext } from '../types';
import { validateRegister } from "../utils/validateRegister";
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
  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg('email') email: string,
    @Ctx() { em, redis }: MyContext
  ) {
    const user = await em.findOne(User, { email });
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
  async me(
    @Ctx() { req, em }: MyContext
  ) {
    // you are not logged in
    if (!req.session.userId) {
      return null
    }

    const user = await em.findOne(User, { id: req.session.userId })
    return user;
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options);
    if (errors) return { errors };

    const hashedPassword = await argon2.hash(options.password)

    const user = em.create(User, {
      email: options.email,
      username: options.username,
      password: hashedPassword
    });


    try {
      /*
        # ALTERNATIVE METHOD: Writing directly to SQL

        import {EntityManager} from '@mikro-orm/postgresql'
        let user;

        try {
          const result = await (em as EntityManager)
            .createQueryBuilder(User)
            .getKnexQuery()
            .insert({
              username: options.username,
              email: options.email,
              password: hashedPassword,
              created_at: new Date(),
              updated_at: new Date(),
            })
            .returning("*")

        user = result[0];
      */
      await em.persistAndFlush(user);
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
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    const user = await em.findOne(
      User,
      usernameOrEmail.includes('@')
        ? { email: usernameOrEmail }
        : { username: usernameOrEmail }
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
