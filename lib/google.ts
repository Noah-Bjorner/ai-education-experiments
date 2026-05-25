import "@std/dotenv/load";
import { GoogleGenAI } from '@google/genai';
import { withRetry } from "../helper/retry.ts";

const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");

if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY environment variable is not set or empty.");
}

const client = new GoogleGenAI({apiKey: GOOGLE_API_KEY});






export interface GoogleAudioResponseOptions {
	model: "gemini-2.5-flash-preview-tts" | "gemini-3.1-flash-tts-preview";
	text: string;
	voiceName: string;
	instructions?: string;
	outDir: string;
}

export interface GoogleAudioOutput {
	path: string;
	tts_model: string;
}


// Simple WAV header creation (Google returns raw PCM, needs WAV headers)
function addWavHeader(pcmData: Uint8Array, sampleRate = 24000, channels = 1, bitsPerSample = 16): Uint8Array {
	const byteRate = sampleRate * channels * bitsPerSample / 8;
	const blockAlign = channels * bitsPerSample / 8;
	const header = new Uint8Array(44);
	const view = new DataView(header.buffer);

	const writeString = (offset: number, str: string) => {
		for (let i = 0; i < str.length; i++) header[offset + i] = str.charCodeAt(i);
	};

	writeString(0, 'RIFF');
	view.setUint32(4, 36 + pcmData.length, true);
	writeString(8, 'WAVE');
	writeString(12, 'fmt ');
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	writeString(36, 'data');
	view.setUint32(40, pcmData.length, true);

	const result = new Uint8Array(44 + pcmData.length);
	result.set(header);
	result.set(pcmData, 44);
	return result;
}


//implement better solution later for multiple speakers if needed.
export const getGoogleAudioResponse = async (options: GoogleAudioResponseOptions): Promise<GoogleAudioOutput> => {
	const tempWavFiles: string[] = [];
	
	try {
		const result = await withRetry(async () => {
			const isMultipleSpeakers = false;
			const promptText = options.instructions ?
			`"INSTRUCTION:
			(Use the voice profile below; do NOT speak these instructions.)
		  
			${options.instructions}
			
			RULES:
			• Read everything between <<<SCRIPT>>> and <<<END>>> exactly as written—add nothing, omit nothing.  
			• Follow the voice ${isMultipleSpeakers ? "profiles" : "profile"} above.
			
			<<<SCRIPT>>>
			${options.text}
			<<<END>>>` : options.text;
		  
			// Generate audio
			const response = await client.models.generateContent({
				model: options.model,
				contents: [{ parts: [{ text: promptText }] }],
				config: {
					responseModalities: ["AUDIO"],
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: {
								voiceName: options.voiceName,
							},
						},
					},
				},
			});

			// Extract audio data
			const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
			if (!audioData) throw new Error("No audio returned by Google Audio API");

			// Convert base64 to bytes and add WAV header
			const pcmData = Uint8Array.from(atob(audioData), (c) => c.charCodeAt(0));
			const wavData = addWavHeader(pcmData);

			// Save temporary WAV file
			await Deno.mkdir(options.outDir, { recursive: true });
			const wavPath = `${options.outDir}/google-audio-${crypto.randomUUID()}.wav`;
			await Deno.writeFile(wavPath, wavData);
			//tempWavFiles.push(wavPath); // Track for cleanup

			return { path: wavPath, tts_model: options.model};
		});

		return result;
	} finally {
		// Clean up ALL temporary WAV files (including from failed retry attempts)
		for (const tempFile of tempWavFiles) {
			try {
				await Deno.remove(tempFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	}
};