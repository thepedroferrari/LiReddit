import { Arg, Ctx, Field, Mutation, ObjectType, Query, Resolver } from "type-graphql";
import argon2 from 'argon2';

import { MyContext } from '../types';
import { User } from '../entities/User';
import { ERROR_CODE } from '../constants';
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { validateRegister } from "src/utils/validateRegister";

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
    @Ctx() { em }: MyContext
  ) {
    const user = await em.findOne(User, { email });
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
        ? { username: usernameOrEmail }
        : { password: usernameOrEmail }
    );

    if (!user) {
      return {
        errors: [{
          field: 'username',
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
