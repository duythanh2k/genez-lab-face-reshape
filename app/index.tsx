import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReshapeScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 18 }}>Face Reshape Lab</Text>
        <Text style={{ color: '#888888', fontSize: 14, marginTop: 8 }}>
          Ready for implementation
        </Text>
      </View>
    </SafeAreaView>
  );
}
