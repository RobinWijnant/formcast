import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { Button, T } from '@/components/ui';
import { ApiError, signIn } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { colors, fonts } from '@/lib/theme';

export default function SignIn() {
  const [email, setEmail] = useState('tom.verhoeven@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace(usePrefs.getState().micPrimed ? '/' : '/permission');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Icon name="mic" color={colors.amber} size={28} strokeWidth={2} />
          </View>
          <T style={styles.h1}>Formcast</T>
          <T style={styles.sub}>Fill in your job reports by talking. Sign in with your company account.</T>

          <View style={styles.fields}>
            <View style={styles.field}>
              <T style={styles.label}>Email</T>
              <TextInput
                accessibilityLabel="Email"
                style={styles.input}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
              />
            </View>
            <View style={styles.field}>
              <T style={styles.label}>Password</T>
              <TextInput
                accessibilityLabel="Password"
                style={styles.input}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError(null);
                }}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>
            {error ? (
              <T style={styles.error} accessibilityRole="alert">
                {error}
              </T>
            ) : null}
          </View>

          <View style={{ flex: 1, minHeight: 24 }} />
          <Button title="Sign in" onPress={submit} loading={loading} />
          <T style={styles.hint}>Demo account: tom.verhoeven@example.com · formcast-demo-2026</T>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 24 },
  logo: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: fonts.semibold, fontSize: 34, letterSpacing: -1, marginTop: 24, marginBottom: 6 },
  sub: { fontSize: 16, lineHeight: 23, color: colors.textMuted },
  fields: { gap: 16, marginTop: 40 },
  field: { gap: 6 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  input: { height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  error: { color: colors.red, fontSize: 14 },
  hint: { textAlign: 'center', fontSize: 12, color: colors.textFaint, marginTop: 14 },
});
