import { createChunkedStore } from "@abonten/core/storage/chunkedStore";
import * as SecureStore from "expo-secure-store";

// A Supabase auth `storage` adapter backed by expo-secure-store.
//
// SecureStore warns (and on some platforms fails) for values larger than
// ~2KB, and a Supabase session JSON is usually bigger than that, so each
// value is kept in pieces. The pieces are written through a journal, so an
// app killed in the middle of saving a refreshed session (swiped away,
// restarted for an update) keeps the whole old session or the whole new one,
// never a mix that supabase-js would throw away as damaged — which used to
// sign people out. See @abonten/core/storage/chunkedStore.
export const secureStorage = createChunkedStore({
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
});
