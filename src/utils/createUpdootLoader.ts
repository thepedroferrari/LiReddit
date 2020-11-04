import DataLoader from "dataloader";
import { Updoot } from '../entities/Updoot';

// keys =
interface UpdootDataLoader {
  postId: number;
  userId: number;
}
// we load [{postId: 5, userId: 10}]
// returns [{postId: 5, userId: 10, value: 1 | -1 | null }]
export const createUpdootLoader = () =>
  new DataLoader<UpdootDataLoader, Updoot | null>(
    async (keys) => {
      const updoots = await Updoot.findByIds(keys as any);
      const updootIdsToUpdooot: Record<string, Updoot> = {};
      updoots.forEach(updoot => {
        updootIdsToUpdooot[`${updoot.userId}|${updoot.postId}`] = updoot;
      })

      return keys.map(key => updootIdsToUpdooot[`${key.userId}|${key.postId}`]);
    });
