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
      }
    ]
  }
];
