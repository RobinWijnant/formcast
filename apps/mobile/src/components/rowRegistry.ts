import { createContext, useContext } from 'react';
import type { View } from 'react-native';

/** Rows register their view by op key so the form can scroll to a changed field. */
export const RowRegistry = createContext<Map<string, View> | null>(null);
export const useRowRegistry = () => useContext(RowRegistry);
