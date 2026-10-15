import * as SecureStore from 'expo-secure-store';

export const storage = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  async set(key: string, value: string | null) {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  },
};
