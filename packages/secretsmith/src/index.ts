export * from "./dropin";
import { search, get, set, del, list, collections, lock, unlock, resolve, resolveSync } from "./dropin";

export default {
  search,
  get,
  set,
  delete: del,
  list,
  collections,
  lock,
  unlock,
  resolve,
  resolveSync,
};