import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import type { JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';

const API_URL = 'http://localhost:3000';

function RoomStage(): React.JSX.Element {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  return (
    <FlatList
      data={tracks}
      keyExtractor={(item, index) => `${item.participant.identity}-${index}`}
      contentContainerStyle={styles.trackList}
      renderItem={({ item }: { item: TrackReferenceOrPlaceholder }) => (
        <View style={styles.participantCard}>
          {isTrackReference(item) ? (
            <VideoTrack trackRef={item} style={styles.video} />
          ) : (
            <View style={[styles.video, styles.videoPlaceholder]} />
          )}
          <Text style={styles.participantName}>
            {item.participant.name || item.participant.identity}
          </Text>
        </View>
      )}
    />
  );
}

export default function App(): React.JSX.Element {
  const [roomId, setRoomId] = useState('general');
  const [displayName, setDisplayName] = useState('Mobile user');
  const [userId] = useState(
    () => `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const [session, setSession] = useState<JoinRoomResponse | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void AudioSession.startAudioSession();
    return () => {
      void AudioSession.stopAudioSession();
    };
  }, []);

  const request = useMemo<JoinRoomRequest>(
    () => ({ roomId: roomId.trim() }),
    [roomId],
  );

  async function join(): Promise<void> {
    const normalizedDisplayName = displayName.trim();
    if (!request.roomId || !normalizedDisplayName) {
      setError('Room and display name are required.');
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/rooms/join`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dev-user-id': userId,
          'x-dev-display-name': normalizedDisplayName,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Join failed (${response.status})`);
      }

      setSession((await response.json()) as JoinRoomResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to join room');
    } finally {
      setJoining(false);
    }
  }

  if (session) {
    return (
      <SafeAreaView style={styles.container}>
        <LiveKitRoom
          serverUrl={session.livekitUrl}
          token={session.token}
          connect
          audio={session.participant.permissions.canPublishAudio}
          video={false}
          options={{ adaptiveStream: true, dynacast: true }}
        >
          <View style={styles.roomHeader}>
            <View>
              <Text style={styles.eyebrow}>LIVE ROOM</Text>
              <Text style={styles.title}>{session.roomSlug}</Text>
              <Text style={styles.role}>{session.participant.role}</Text>
            </View>
            <Button title="Leave" onPress={() => setSession(null)} />
          </View>
          <RoomStage />
        </LiveKitRoom>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.joinCard}>
        <Text style={styles.eyebrow}>LIVE DISCUSSIONS</Text>
        <Text style={styles.title}>Join from your phone</Text>

        <TextInput
          style={styles.input}
          value={roomId}
          onChangeText={setRoomId}
          placeholder="Room name"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
        />

        {joining ? (
          <ActivityIndicator />
        ) : (
          <Button title="Join discussion" onPress={() => void join()} />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  joinCard: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  eyebrow: { color: '#94a3b8', fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: 'white', fontSize: 28, fontWeight: '700', marginTop: 4 },
  role: { color: '#a5b4fc', marginTop: 4, textTransform: 'capitalize' },
  input: { backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  error: { color: '#fca5a5' },
  roomHeader: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackList: { padding: 16, gap: 16 },
  participantCard: { backgroundColor: '#1e293b', borderRadius: 16, overflow: 'hidden' },
  video: { height: 260, width: '100%' },
  videoPlaceholder: { backgroundColor: '#334155' },
  participantName: { color: 'white', fontWeight: '600', padding: 12 },
});
