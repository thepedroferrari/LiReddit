import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
  UseMiddleware
} from 'type-graphql';
import { getConnection } from 'typeorm';

import { Post } from '../entities/Post';
import { isAuth } from '../middlewares/isAuth';
import { MyContext } from '../types';
import { Updoot } from '../entities/Updoot';
import { User } from '../entities/User';

@InputType()
class PostInput {
  @Field()
  title: string

  @Field()
  text: string
}

@ObjectType()
class PaginatedPosts {
  @Field(() => [Post])
  posts: Post[]
  @Field()
  hasMore: boolean
}

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  excerpt(@Root() root: Post) {
    return root.text.slice(0, 175)
  }

  @FieldResolver(() => User)
  author(
    @Root() post: Post,
    @Ctx() { userLoader }: MyContext
  ) {
    return userLoader.load(post.authorId)
  }

  @FieldResolver(() => Int, { nullable: true })
  async voteStatus(
    @Root() post: Post,
    @Ctx() { updootLoader, req }: MyContext
  ) {
    if (!req.session.userId) return null;

    const updoot = await updootLoader.load({
      postId: post.id,
      userId: req.session.userId
    })

    return updoot ? updoot.value : null;
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async vote(
    @Arg('postId', () => Int) postId: number,
    @Arg('value', () => Int) value: number,
    @Ctx() { req }: MyContext
  ) {
    const isUpdoot = value !== -1;
    const upDoot = isUpdoot ? 1 : -1
    const { userId } = req.session
    const vote = await Updoot.findOne({ where: { postId, userId } })

    // the user has voted on the post before
    // and they are changing their vote
    if (vote && vote.value !== upDoot) {
      await getConnection().transaction(async tm => {
        // We don't need to insert into updoot table
        await tm.query(`
          update updoot
          set value = $1
          where "postId" = $2 and "userId" = $3
        `, [upDoot, postId, userId])

        // We update the points on the post
        await tm.query(
          `
          update post
          set points = points + $1
          where id = $2
          `,
          [2 * upDoot, postId]
        )
      })
    } else if (!vote) {
      // They haven't voted yet
      await getConnection().transaction(async tm => {
        await tm.query(`
          insert into updoot ("userId", "postId", value)
          values ($1, $2, $3);
        `, [userId, postId, upDoot])
        await tm.query(`
          update post
          set points = points + $1
          where id = $2
        `, [upDoot, postId])
      })
    }

    return true
  }

  @Query(() => PaginatedPosts)
  async posts(
    @Arg('limit', () => Int) limit: number,
    @Arg('cursor', () => String, { nullable: true }) cursor: string | null
  ): Promise<PaginatedPosts> {
    // +1 so we can check if we get back more posts than the query, meaning
    // hasMore will be true, or false if the response was less than
    // the request + 1.
    const realLimit = Math.min(50, limit);
    const realLimitPlusOne = realLimit + 1;

    const replacements: any[] = [realLimitPlusOne];

    if (cursor) replacements.push(new Date(parseInt(cursor)));

    const posts = await getConnection().query(`
      select p.*
      from post p
      ${cursor ? `where p."createdAt" < $2` : ''}
      order by p."createdAt" DESC
      limit $1
    `, replacements)

    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimitPlusOne
    }
  }

  @Query(() => Post, { nullable: true })
  post(@Arg('id', () => Int) id: number): Promise<Post | undefined> {
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
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg('id', () => Int) id: number,
    @Arg('title') title: string,
    @Arg('text') text: string,
    @Ctx() { req }: MyContext
  ): Promise<Post | null> {
    const result = await getConnection()
      .createQueryBuilder()
      .update(Post)
      .set({ title, text })
      .where('id = :id and "authorId" = :authorId', {
        id,
        authorId: req.session.userId
      })
      .returning("*")
      .execute();

    return result.raw[0]
  }


  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg('id', () => Int) id: number,
    @Ctx() { req }: MyContext
  ): Promise<boolean> {
    const post = await Post.findOne(id);
    if (!post) return false;
    if (post?.authorId !== req.session.userId) {
      throw new Error('not authorized');
    }
    await Updoot.delete({ postId: id })
    await Post.delete({
      id,
      authorId: req.session.userId
    });
    return true;
  }
}
