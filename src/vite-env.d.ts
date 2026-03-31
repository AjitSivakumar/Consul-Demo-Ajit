/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_OPENAI_API_KEY?: string;
	readonly VITE_DEBUG_AI?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface SpeechRecognitionAlternative {
	readonly transcript: string;
	readonly confidence: number;
}

interface SpeechRecognitionResult {
	readonly isFinal: boolean;
	readonly length: number;
	[index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
	readonly length: number;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
	readonly resultIndex: number;
	readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
	readonly error: string;
	readonly message: string;
}

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
	onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
	onend: ((this: SpeechRecognition, ev: Event) => any) | null;
	start(): void;
	stop(): void;
}

interface SpeechRecognitionConstructor {
	new (): SpeechRecognition;
}

interface Window {
	SpeechRecognition?: SpeechRecognitionConstructor;
	webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
