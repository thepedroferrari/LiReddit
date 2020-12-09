import { Request, Response } from 'express';
import { Redis } from 'ioredis'
import { createUserLoader } from './utils/createUserLoader';
import { createUpdootLoader } from './utils/createUpdootLoader';

export type MyContext = {
  redis: Redis;
  req: Request & { session: any };
  res: Response;
  userLoader: ReturnType<typeof createUserLoader>
  updootLoader: ReturnType<typeof createUpdootLoader>
}
