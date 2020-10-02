import { Arg, Ctx, Field, InputType, Mutation, ObjectType, Query, Resolver } from "type-graphql";
import argon2 from 'argon2';

import { MyContext } from '../types';
import { User } from '../entities/User';
import { ERROR_CODE } from '../constants';

@InputType()
class UsernamePasswordInput {
  @Field()
  username: string;
  @Field()
  password: string;
}

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
  @Query(() => User, { nullable: true })
  async me(
      @Ctx() {req, em}:MyContext
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
    if (options.username.length < 3) {
      return {
        errors: [{
          field: 'username',
          message: 'Your username must be at least 3 characters long'
        }]
      }
    }


    if (options.password.length < 6) {
      return {
        errors: [{
          field: 'password',
          message: 'Your password must be at least 6 characters long'
        }]
      }
    }

    const hashedPassword = await argon2.hash(options.password)

    const user = em.create(User, {
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
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    const user = await em.findOne(User, { username: options.username })
    if (!user) {
      return {
        errors: [{
          field: 'username',
          message: 'That username does not exist'
        }]
      }
    }

    const validPwd = await argon2.verify(user.password, options.password);
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
}
