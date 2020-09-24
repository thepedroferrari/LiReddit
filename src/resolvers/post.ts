import { Arg, Ctx, Int, Mutation, Query, Resolver } from "type-graphql";
import { Post } from '../entities/Post';
import { MyContext } from '../types';

@Resolver()
export class PostResolver {
  @Query(() => [Post])
  posts(
    @Ctx() {em}: MyContext
  ): Promise<Post[]> {
    return em.find(Post, {})
  }

  @Query(() => Post, { nullable: true })
  post(
    @Arg('id') id: number,
    @Ctx() { em }: MyContext
  ): Promise<Post | null> {
    return em.findOne(Post, { id })
  }

}
