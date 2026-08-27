import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  FlatList,
  PermissionsAndroid,
  Platform,
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
  useLocalParticipant,
  useLocalParticipantPermissions,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import type { JoinRoomRequest, JoinRoomResponse } from '@live-discussions/contracts';

const DEFAULT_API_URL = Platform.select({
  android: 'http://10.0.2.2:3000',
  ios: 'http://localhost:3000',
  default: 'http://localhost:3000',
}) ?? 'http://localhost:3000';

function RoomStage(): React.JSX.Element {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const {
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant();
  const participantPermissions = useLocalParticipantPermissions();
  const [mediaError, setMediaError] = useState<string | null>(null);
  const canPublish = participantPermissions?.canPublish === true;

  async function toggleMicrophone(): Promise<void> {
    setMediaError(null);
    if (!canPublish) return;

    if (!isMicrophoneEnabled && Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        setMediaError('Microphone permission is required to speak.');
        return;
      }
    }

    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (caught) {
      setMediaError(mediaErrorMessage(caught, 'Unable to change microphone state.'));
    }
  }

  async function toggleCamera(): Promise<void> {
    setMediaError(null);
    if (!canPublish) return;

    if (!isCameraEnabled && Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        setMediaError('Camera permission is required to publish video.');
        return;
      }
    }

    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch (caught) {
      setMediaError(mediaErrorMessage(caught, 'Unable to change camera state.'));
    }
  }

  async function toggleScreenShare(): Promise<void> {
    setMediaError(null);
    if (!canPublish) return;
    if (Platform.OS === 'ios') {
      setMediaError('iOS screen sharing is not enabled until the Broadcast Extension is installed.');
      return;
    }

    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } catch (caught) {
      setMediaError(mediaErrorMessage(caught, 'Unable to change screen sharing state.'));
    }
  }

  return (
    <View style={styles.roomBody}>
      <FlatList
        data={tracks}
        keyExtractor={(item, index) => `${item.participant.identity}-${item.source}-${index}`}
        contentContainerStyle={styles.trackList}
        ListEmptyComponent={
          <View style={styles.emptyStage}>
            <Text style={styles.hint}>No camera or screen share is active.</Text>
          </View>
        }
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

      <View style={styles.mediaControls}>
        <Button
          title={isMicrophoneEnabled ? 'Mute' : 'Mic'}
          onPress={() => void toggleMicrophone()}
          disabled={!canPublish}
        />
        <Button
          title={isCameraEnabled ? 'Stop camera' : 'Camera'}
          onPress={() => void toggleCamera()}
          disabled={!canPublish}
        />
        <Button
          title={isScreenShareEnabled ? 'Stop sharing' : 'Share screen'}
          onPress={() => void toggleScreenShare()}
          disabled={!canPublish || Platform.OS === 'ios'}
        />
      </View>

      {!canPublish ? (
        <Text style={styles.hint}>Your current room role/stage position does not allow publishing.</Text>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Text style={styles.hint}>iOS screen share will be enabled after its Broadcast Extension is added.</Text>
      ) : null}
      {mediaError ? <Text style={styles.error}>{mediaError}</Text> : null}
    </View>
  );
}

function mediaErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function App(): React.JSX.Element {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
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
    const normalizedApiUrl = apiUrl.trim().replace(/\/+$/, '');
    const normalizedDisplayName = displayName.trim();
    if (!request.roomId || !normalizedDisplayName) {
      setError('Room and display name are required.');
      return;
    }
    if (!/^https?:\/\//i.test(normalizedApiUrl)) {
      setError('API base URL must start with http:// or https://.');
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const response = await fetch(`${normalizedApiUrl}/rooms/join`, {
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

      setApiUrl(normalizedApiUrl);
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
          audio={false}
          video={false}
          options={{ adaptiveStream: true, dynacast: true }}
        >
          <View style={styles.roomHeader}>
            <View>
              <Text style={styles.eyebrow}>LIVE ROOM</Text>
              <Text style={styles.title}>{session.roomTitle}</Text>
              <Text style={styles.roomPath}>/room/{session.roomSlug}</Text>
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
          value={apiUrl}
          onChangeText={setApiUrl}
          placeholder="API base URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>
          Android emulator defaults to 10.0.2.2. For a physical device, use your computer's LAN URL or the hosted API URL.
        </Text>
        <TextInput
          style={styles.input}
          value={roomId}
          onChangeText={setRoomId}
          placeholder="Room name"
          autoCapitalize="none"
          autoCorrect={false}
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
  roomPath: { color: '#64748b', marginTop: 4 },
  role: { color: '#a5b4fc', marginTop: 4, textTransform: 'capitalize' },
  input: { backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  hint: { color: '#94a3b8', fontSize: 12, lineHeight: 17, paddingHorizontal: 16 },
  error: { color: '#fca5a5', paddingHorizontal: 16 },
  roomHeader: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomBody: { flex: 1 },
  trackList: { padding: 16, gap: 16 },
  emptyStage: { minHeight: 180, justifyContent: 'center', alignItems: 'center' },
  participantCard: { backgroundColor: '#1e293b', borderRadius: 16, overflow: 'hidden' },
  video: { height: 260, width: '100%' },
  videoPlaceholder: { backgroundColor: '#334155' },
  participantName: { color: 'white', fontWeight: '600', padding: 12 },
  mediaControls: {
    padding: 16,
    gap: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
});
