import { ApolloServer } from 'apollo-server-express';
import connectRedis from 'connect-redis';
import cors from 'cors'
import express from 'express';
import session from 'express-session';
import { MikroORM } from '@mikro-orm/core';
import Redis from 'ioredis';
import 'reflect-metadata';

import { __prod__, COOKIE_NAME, ONE_YEAR } from './constants';
import microConfig from './mikro-orm.config';
import { buildSchema } from 'type-graphql';
import { HelloResolver } from './resolvers/hello';
import { PostResolver } from './resolvers/post';
import { UserResolver } from './resolvers/user';

const main = async () => {
  const orm = await MikroORM.init(microConfig);
  await orm.getMigrator().up();

  const app = express();

  const RedisStore = connectRedis(session);
  const redis = new Redis();

  app.use(cors({
    origin: "http://localhost:3000",
    credentials: true
  }))
  app.use(
    session({
      name: COOKIE_NAME,
      store: new RedisStore({
        client: redis,
        disableTouch: true
      }),
      cookie: {
        maxAge: ONE_YEAR * 10,
        httpOnly: true,
        sameSite: 'lax',
        secure: __prod__
    },
      saveUninitialized: false,
      secret: 'isuadhoisdhaoiuadshoiudash',
      resave: false,
    })
  )

  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [HelloResolver, PostResolver, UserResolver],
      validate: false
    }),
    context: ({ req, res }) => ({ em: orm.em, req, res, redis })
  });

  apolloServer.applyMiddleware({
    app,
    cors: false
  });

  app.listen(4000, () => {
    console.log('server started on http://localhost:4000')
  })
};

main().catch(err => {
  console.log(err);
});
