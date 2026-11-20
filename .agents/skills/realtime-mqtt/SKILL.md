---
name: realtime-mqtt
description: Realtime / live updates between open copies of the app — MQTT topics through the SDK's useMqttSubscribe and useMqttPublish. Load for: realtime, live updates, "without refreshing", two users seeing the same change, a shared board or queue, an MQTT event an automation publishes into the app, or "why does the other tab not update". Covers topic naming, the no-retention rule, and why it is silent in preview. Not for notifying someone whose tab is closed, and not for polling.
version: 1
---

# Realtime — MQTT topics

Two people have the same screen open. One marks an order shipped; the other's list
updates a second later with nobody pressing refresh. That is what this is for.

The transport is MQTT, run by the platform. There is nothing to install, no broker to
configure and no connection to manage — two hooks, and the app's own identity scopes
everything.

**Requires `@unifyapps/app-builder-sdk` >= 0.5.0.** If the app's `package.json` pins
below that, the hooks do not exist and the build fails on the import.

## Which request is this?

| The user means | What to do |
|---|---|
| "Live updates", "without refreshing", "both users see it", a shared queue/board | This skill |
| "Tell me when a backend job finishes" | This skill — the automation publishes in, see [From an automation](#from-an-automation) |
| "Notify the user" when their tab may be **closed** | **Not this.** Nothing is stored; a closed tab misses it. That is a push notification or a record they read on load |
| "Refresh every 30 seconds" | Ordinary polling — `refetchInterval` on the query. Simpler, and it survives a missed message |
| Two components in the SAME tab need to talk | A zustand store in `src/lib/store.ts`. Never the broker — see [Not a state channel](#not-a-state-channel) |

## The hooks

```tsx
import { useMqttPublish, useMqttSubscribe } from '@unifyapps/app-builder-sdk';

function OrdersBoard() {
  const queryClient = useQueryClient();
  const publish = useMqttPublish();

  useMqttSubscribe('order-status-updated', () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  });

  return (
    <Button
      onClick={async () => {
        await markShipped(order.id);
        publish('order-status-updated', { orderId: order.id, status: 'SHIPPED' });
      }}
    >
      Mark shipped
    </Button>
  );
}
```

That is the whole API: `useMqttSubscribe(topic, onMessage)` and
`publish(topic, payload)`.

**There is no setup.** No provider to add, no connection to open, no cleanup to write.
`AppBuilderProvider` — already in `main.tsx` — owns it, and it stays completely idle
until the first hook runs, so an app that never uses realtime pays nothing for it.

**Both are safe to call unconditionally.** Do not guard them, do not branch on whether
realtime is available, do not `try/catch`. Where it is switched off (below) they do
nothing at all.

**Write them naturally.** The handler may be an inline arrow and the topic may be an
inline array — the handler is held by reference and the topic is keyed on its contents,
so neither resubscribes on re-render. Do not wrap them in `useCallback` / `useMemo` to
"fix" something that is not broken.

**Never write your own `useEffect` around this.** `useMqttSubscribe` *is* the
subscription — it subscribes, resubscribes and cleans up on unmount. An effect that
calls it, or that tries to manage a connection alongside it, is a bug.

## The rule that decides your design

**A message is a hint, not the data.**

Nothing is retained and nothing is replayed. A component that mounts one second after a
publish receives nothing. A tab that was closed, asleep or offline receives nothing, and
there is no catch-up.

So the payload must never be the source of truth. The message says *something changed*;
the data still comes from the API:

```tsx
// RIGHT — refetch, and the screen is correct whether or not the message arrived
useMqttSubscribe('order-status-updated', () => {
  void queryClient.invalidateQueries({ queryKey: ['orders'] });
});

// WRONG — a tab that missed one message is silently, permanently out of date
useMqttSubscribe('order-status-updated', (message) => {
  setOrders((prev) => applyPatch(prev, message));
});
```

The wrong version looks right in testing, because in testing no message is ever missed.

Send a payload anyway when it saves work — an id to decide *whether* this screen cares:

```tsx
useMqttSubscribe('order-status-updated', (message) => {
  const { orderId } = message as { orderId?: string };
  if (orderId && orderId !== currentOrderId) return;
  void queryClient.invalidateQueries({ queryKey: ['orders', currentOrderId] });
});
```

Payloads are JSON. The value handed to `onMessage` is already parsed, and it is typed
`unknown` because the sender is not necessarily this app — narrow it before reading it,
and tolerate a field being absent. Nothing validates the shape.

## Naming a topic

A plain descriptive string: `order-status-updated`, `queue-changed`,
`warehouse-3/temperature`. There is no format to follow and no wildcard matching — a
listener on `order-status-updated` hears exactly that name.

Pass the **bare** name. The app's own id is joined to it underneath, so two different
apps can both use `order-status-updated` and never hear each other. Never build that
prefix yourself, and never put the app id in the string you pass.

Hoist the name to a constant when more than one file uses it — matching is exact, and a
publisher and a subscriber that disagree by one character fail silently, with no error
anywhere.

```tsx
export const ORDERS_TOPIC = 'order-status-updated';
```

Few topics, named for the change: one per kind of thing that changed, not one per
button. A topic per record id (`` `order-${id}` ``) is legitimate when a screen genuinely
watches one record, but prefer one topic plus an id in the payload.

## Where to publish

In the handler, **after the change has actually landed**:

```tsx
await markShipped(order.id);
publish(ORDERS_TOPIC, { orderId: order.id });
```

Not in render, not in `useEffect`, not before the `await`. Publishing first tells every
other tab to refetch data that has not changed yet, and they re-read the old value.

Do not publish on the failure path.

**You do not need to update your own screen with it.** The publisher already knows what
it did — invalidate locally as usual. The message is for the *other* copies.

## Not a state channel

Two components in one tab talk through a store, props or context — never the broker. A
round trip to the server to move a boolean between two components on the same page is
slow, drops under a flaky network, and will not work in preview at all.

The broker is for crossing a **browser-tab boundary**: another person, or the same
person in another window.

## From an automation

An automation can publish into the app with the **Send Mqtt Request** node — it takes an
`applicationId` and a `topicName`, and the app subscribes to the bare name exactly as
above. That is how "the nightly import finished, refresh the dashboard" works.

Two things to tell the user when you wire this:

- The automation must be given **this app's id** as `applicationId`, or the message goes
  to a channel nothing listens on.
- The topic name must match the string in the code **exactly**.

The same channel is shared with no-code apps' **Send MQTT event** action, so a no-code
app and a code app pointed at the same app id and topic talk to each other.

## Where it does not run

Realtime runs on a **deployed, private** app. It is off in three places, and each is
deliberate:

| Where | Why |
|---|---|
| **Preview / the builder** | Preview is served from a different origin that has no broker route |
| **A public app** | A sessionless visitor has no identity the broker can verify, so the connection would be refused |
| **The app's own login / auth routes** | Nothing there speaks for a signed-in user yet |

In all three the hooks are silent no-ops — nothing throws, nothing warns.

**Preview is the one that will be reported as a bug in your work.** A maker clicking
Preview sees a feature that does nothing. So when you finish, **say this in your reply**:
which topics you added, what publishes and what listens, and that realtime only works
once the app is **published and opened as the deployed app** — preview will look inert.

If realtime is the centre of the screen, make the app honest about it: a screen that is
only correct when a message arrives is a screen that is wrong in preview. Keep the
ordinary load path working on its own, and let the message be the thing that makes it
*fast*.

## Why nothing is arriving

| Symptom | Cause |
|---|---|
| Nothing in preview | **Expected.** Publish and open the deployed app |
| Nothing in a public app | Off by design — a public app has no session to verify |
| Nothing between two tabs of the deployed app | The topic strings do not match exactly. Grep both sides; hoist to a shared constant |
| Nothing from an automation | Its `applicationId` is not this app's id, or its `topicName` differs |
| The build fails on the import | SDK pinned below 0.5.0 |
| Works, but one tab is stale | The handler is patching local state instead of refetching. See [the rule](#the-rule-that-decides-your-design) |
