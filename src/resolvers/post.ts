import { isAuth } from '../middlewares/isAuth';
import { Arg, Field, InputType, Mutation, Query, Resolver, Ctx, UseMiddleware, Float } from 'type-graphql';
import { Post } from '../entities/Post';
import { MyContext } from '../types';
import { getConnection } from 'typeorm';

@InputType()
class PostInput {
  @Field()
  title: string

  @Field()
  text: string
}

@Resolver()
export class PostResolver {
  @Query(() => [Post])

  async posts(
    @Arg('limit') limit: number,
    @Arg('cursor', () => Float, { nullable: true }) cursor: number | null
  ): Promise<Post[]> {
    const realLimit = Math.min(50, limit);
    const qb = getConnection()
      .getRepository(Post)
      .createQueryBuilder('post')
      .orderBy('"createdAt"', "DESC")
      .take(realLimit)

    if (cursor) {
      qb.where('"createdAt" > :cursor', { cursor: new Date(cursor) })
    }

    return qb.getMany()
  }

  @Query(() => Post, { nullable: true })
  post(@Arg('id') id: number): Promise<Post | undefined> {
    return Post.findOne(id);
  }

  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg('input') input: PostInput,
    @Ctx() { req }: MyContext
  ): Promise<Post> {
    return Post.create({
      ...input,
      authorId: req.session.userId
    }).save();
  }

  @Mutation(() => Post, { nullable: true })
  async updatePost(
    @Arg('id') id: number,
    @Arg('title') title: string
  ): Promise<Post | null> {
    const post = await Post.findOne(id);
    if (!post) return null;

    if (typeof title !== 'undefined') {
      await Post.update({ id }, { title })
    }
    return post
  }


  @Mutation(() => Boolean)
  async deletePost(@Arg('id') id: number): Promise<boolean> {
    await Post.delete(id);
    return true;
  }
}
