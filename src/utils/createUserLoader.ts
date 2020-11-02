import DataLoader from "dataloader";
import { User } from '../entities/User';

// keys = smth like [1, 78, 9, 100] Receives an user Id

/**
 * @summary Creates a userIds list
 * @description CreateUserLoader uses the DataLoader to load in a single query multiple users to then attach them to their locations without doing multiple SQL queries.
 * @params userIds: number[]
 *
 * @returns User[]
**/
export const createUserLoader = () =>
  new DataLoader<number, User>(async (userIds) => {
    const users = await User.findByIds(userIds as number[]);
    const userIdToUser: Record<number, User> = {};
    users.forEach(u => userIdToUser[u.id] = u)

    return userIds.map(userId => userIdToUser[userId]);
});
