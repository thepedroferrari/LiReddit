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

    if (cursor) replacements.push(new Date(parseInt(cursor)))

    const posts = await getConnection().query(`
      select p.*,
      json_build_object(
        'id', u.id,
        'username', u.username,
        'email', u.email,
        'createdAt', u."createdAt",
        'updatedAt', u."updatedAt"
      ) author
      (select value from updoot where "userId" = $2 and "postId" = p.id) "voteStatus"
      from post p
      inner join public.user u on u.id = p."authorId"
      ${cursor ? `where p."createdAt" < $3` : ''}
      order by p."createdAt" DESC
      limit $1
    `, replacements)

    // const qb = getConnection()
    //   .getRepository(Post)
    //   .createQueryBuilder('post')
    //   .innerJoinAndSelect(
    //     "post.author",
    //     "author",
    //     'author.id = post."authorId"'
    //   )
    //   .orderBy('post."createdAt"', "DESC")
    //   .take(realLimitPlusOne)

    // if (cursor) {
    //   qb.where('post."createdAt" < :cursor',
    //     { cursor: new Date(parseInt(cursor)) }
    //   )
    // }

    // const posts = await qb.getMany();

    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimitPlusOne
    }
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
