import { MeetingContext, TranscriptEvent } from '../types/domain';

export interface MeetingPreset {
  id: string;
  label: string;
  context: MeetingContext;
  transcript: TranscriptEvent[];
}

export const meetingPresets: MeetingPreset[] = [
  {
    id: 'gtc-iridium',
    label: 'GTC × Iridium Demo',
    context: {
      meetingId: 'meeting-iridium-gtc',
      title: 'Iridium × GTC',
      participants: ['Account Exec', 'Sales Engineer', 'GTC Buyer'],
      accountContext: 'GTC',
      projectContext: 'Preet Chandi South Pole expedition',
      discussedThemes: [],
      unresolvedQuestions: [],
      deliverableTargets: ['Research summary', 'Pricing Q&A', 'Slide leave-behind'],
      confidenceByTheme: {}
    },
    transcript: [
      {
        id: 'evt-1',
        timestampIso: '2026-03-29T17:00:05Z',
        speaker: 'GTC Buyer',
        text: 'Why do we need both devices for Preet? It sounds redundant.',
        segmentId: 'seg-1'
      },
      {
        id: 'evt-2',
        timestampIso: '2026-03-29T17:00:22Z',
        speaker: 'Account Exec',
        text: 'Extreme covers voice and SOS. GO supports photo upload. They solve different constraints.',
        segmentId: 'seg-2'
      },
      {
        id: 'evt-3',
        timestampIso: '2026-03-29T17:00:49Z',
        speaker: 'GTC Buyer',
        text: 'Do we have deployment evidence that dual-device setups succeed more often?',
        segmentId: 'seg-3'
      },
      {
        id: 'evt-4',
        timestampIso: '2026-03-29T17:01:12Z',
        speaker: 'Sales Engineer',
        text: 'We should compare mission completion and comms uptime for dual versus single-device teams.',
        segmentId: 'seg-4'
      },
      {
        id: 'evt-5',
        timestampIso: '2026-03-29T17:01:31Z',
        speaker: 'GTC Buyer',
        text: 'What pricing bundle would we propose Thursday? That seems unresolved.',
        segmentId: 'seg-5'
      },
      {
        id: 'evt-6',
        timestampIso: '2026-03-29T17:01:55Z',
        speaker: 'Account Exec',
        text: "My instinct is they're complementary not redundant — the Iridium Extreme handles all voice and SOS natively, and the GO! handles photos and data uploads. But GTC might push back and say two devices complicates the story for a solo expedition.",
        segmentId: 'seg-6'
      },
      {
        id: 'evt-7',
        timestampIso: '2026-03-29T17:02:20Z',
        speaker: 'Account Exec',
        text: "That chart is the answer. We're not walking into Thursday asking GTC to trust our instinct — we're showing them the data. Ninety-four versus seventy-one percent is not a marginal difference. And the capability gap is black and white — you literally cannot do voice blogs on the GO! alone.",
        segmentId: 'seg-7'
      },
      {
        id: 'evt-8',
        timestampIso: '2026-03-29T17:02:55Z',
        speaker: 'Sales Engineer',
        text: "Exactly. And honestly — the passive setup is the biggest differentiator for solo expeditions specifically. The content delivery number is where it really shows. The GO! keeping that data pipeline open without Preet ever touching it — that's why the content numbers are so much higher with the dual-device setup.",
        segmentId: 'seg-8'
      },
      {
        id: 'evt-9',
        timestampIso: '2026-03-29T17:03:25Z',
        speaker: 'Sales Engineer',
        text: "I think we should actually lead with the GO! as the primary device in our pitch — it handles the photos and data that audiences actually engage with, and the Extreme is kind of backup voice.",
        segmentId: 'seg-9'
      },
      {
        id: 'evt-10',
        timestampIso: '2026-03-29T17:03:58Z',
        speaker: 'Sales Engineer',
        text: "Either way, we're not asking Preet to make a decision on the ice — she picks up the Extreme for voice and the GO! runs passively for everything else. And if something goes wrong she hits SOS on the Extreme.",
        segmentId: 'seg-10'
      },
      {
        id: 'evt-11',
        timestampIso: '2026-03-29T17:04:20Z',
        speaker: 'Account Exec',
        text: "Let's build the slide around this.",
        segmentId: 'seg-11'
      }
    ]
  }
];
