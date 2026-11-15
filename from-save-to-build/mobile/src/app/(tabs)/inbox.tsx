import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { SignInScreen, go } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { Notification } from '@/lib/types';
import { Badge, Card, Empty, ErrorNote, H1, H3, Muted, P, QueryView, Row, Screen, theme, useAction } from '@/ui';

/** Where a notification leads. Application links carry the application id, so the round is looked up first. */
async function pathFor(n: Notification): Promise<string | null> {
  const link = n.link;
  if (!link) return null;
  switch (link.screen) {
    case 'application': {
      const items = await queryClient.fetchQuery({ queryKey: keys.myTesting, queryFn: () => api.myTesting() });
      const item = items.find((i) => i.application.id === link.id);
      return item ? `/rounds/${item.round.id}/application` : '/(tabs)/tests';
    }
    case 'assignment': return `/assignments/${link.id}`;
    case 'bug': case 'creator_bug': return `/bugs/${link.id}`;
    case 'creator_application': return '/(tabs)/creator';
    case 'creator_round': return `/creator/rounds/${link.id}`;
    default: return null;
  }
}

export default function Inbox() {
  const { userId, ready } = useAuth();
  const q = useQuery({ queryKey: keys.notifications, queryFn: () => api.notifications(), enabled: !!userId });
  const open = useAction(async (n: Notification) => {
    if (!n.read_at) {
      await api.markNotificationRead(n.id);
      void queryClient.invalidateQueries({ queryKey: keys.notifications });
    }
    const path = await pathFor(n);
    if (path) go(path);
  });
  if (ready && !userId) return <SignInScreen title="Inbox" message="Sign in to see messages about your applications and tests." />;
  return (
    <Screen title="Inbox">
      <H1>Inbox</H1>
      <ErrorNote error={open.error} />
      <QueryView query={q}>
        {(items) => {
          if (items.length === 0) return <Empty title="No messages yet" body="Updates about your applications, invitations and reported issues appear here." />;
          return (
            <View style={{ gap: theme.space.md }}>
              {items.map((n) => {
                const unread = !n.read_at;
                const approval = n.type === 'application.approved';
                const invite = n.type === 'assignment.invited';
                return (
                  <Card key={n.id} testID={`notification-${n.id}`} onPress={() => open.run(n)}
                    style={[unread && { borderColor: theme.color.accent, borderLeftWidth: 4 }, approval && { backgroundColor: theme.color.goodSoft }]}>
                    <Row wrap>
                      {approval && <Badge tone="good" label="Approval" />}
                      {invite && <Badge tone="good" label="Invitation" />}
                      {unread && <Badge tone="info" label="New" />}
                    </Row>
                    <H3 style={unread ? undefined : { fontWeight: '500', color: theme.color.body }}>{n.title}</H3>
                    {!!n.body && <P style={{ fontSize: theme.font.small }}>{n.body}</P>}
                    {approval && <Muted style={{ fontSize: theme.font.small }}>Your testing invitation follows separately — tap to see your application.</Muted>}
                    <Muted style={{ fontSize: theme.font.tiny }}>{dateTime(n.created_at)}</Muted>
                  </Card>
                );
              })}
            </View>
          );
        }}
      </QueryView>
    </Screen>
  );
}
