import { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X, UserX, ShieldAlert } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';

type Provider = 'email' | 'google' | 'apple';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteAccountModal({ visible, onClose, onDeleted }: Props) {
  const { user, reauthenticateWithPassword, reauthenticateWithProvider, deleteAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmStage, setConfirmStage] = useState(false);

  const providerRaw = (user?.app_metadata?.provider as string | undefined) || 'email';
  const provider: Provider =
    providerRaw === 'google' || providerRaw === 'apple' ? providerRaw : 'email';

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setError(null);
      setLoading(false);
      setConfirmStage(false);
    }
  }, [visible]);

  const runDelete = async () => {
    const { error: delErr } = await deleteAccount();
    if (delErr) {
      setLoading(false);
      setError(delErr);
      return;
    }
    setLoading(false);
    onDeleted();
  };

  const handleConfirm = async () => {
    setError(null);

    if (provider === 'email') {
      if (!password) {
        setError('パスワードを入力してください');
        return;
      }
      setLoading(true);
      const { error: authErr } = await reauthenticateWithPassword(password);
      if (authErr) {
        setLoading(false);
        setError(authErr);
        return;
      }
      await runDelete();
      return;
    }

    setLoading(true);
    const { error: authErr } = await reauthenticateWithProvider(provider);
    if (authErr) {
      setLoading(false);
      setError(authErr);
      return;
    }
    await runDelete();
  };

  const providerLabel = provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <ShieldAlert size={22} color="#ff3b30" />
            </View>
            <Text style={styles.title}>アカウントを削除</Text>
            <TouchableOpacity onPress={onClose} disabled={loading} style={styles.closeBtn}>
              <X size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            このアカウントと全てのデータが完全に削除されます。{'\n'}
            この操作は取り消せません。
          </Text>

          {!confirmStage ? (
            <>
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  続行するにはご本人確認が必要です。
                </Text>
              </View>

              {provider === 'email' ? (
                <View style={styles.field}>
                  <Text style={styles.label}>パスワード</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="現在のパスワード"
                    placeholderTextColor="#999"
                    editable={!loading}
                  />
                </View>
              ) : (
                <View style={styles.providerBox}>
                  <Text style={styles.providerText}>
                    {providerLabel}アカウントでの再認証が必要です。{'\n'}
                    次のボタンを押すと{providerLabel}の認証画面が開きます。
                  </Text>
                </View>
              )}

              {error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  disabled={loading}
                >
                  <Text style={styles.cancelText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={() => {
                    setError(null);
                    if (provider === 'email' && !password) {
                      setError('パスワードを入力してください');
                      return;
                    }
                    setConfirmStage(true);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.nextText}>次へ</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={styles.finalBox}>
                <UserX size={32} color="#ff3b30" />
                <Text style={styles.finalTitle}>本当に削除しますか？</Text>
                <Text style={styles.finalText}>
                  {provider === 'email'
                    ? 'パスワードを確認してアカウントを削除します。'
                    : `${providerLabel}で再認証を行い、アカウントを削除します。`}
                </Text>
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setConfirmStage(false)}
                  disabled={loading}
                >
                  <Text style={styles.cancelText}>戻る</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleConfirm}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.deleteText}>削除する</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      web: { boxShadow: '0 10px 30px rgba(0,0,0,0.2)' } as any,
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffe5e3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeBtn: {
    padding: 4,
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 21,
    marginBottom: 16,
  },
  warningBox: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    fontSize: 13,
    color: '#9a3412',
    lineHeight: 19,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: '#333',
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  providerBox: {
    backgroundColor: '#f4f6f8',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  providerText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 20,
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 13,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  nextText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  finalBox: {
    alignItems: 'center',
    paddingVertical: 16,
    marginBottom: 8,
  },
  finalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginTop: 10,
    marginBottom: 6,
  },
  finalText: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 19,
  },
});
