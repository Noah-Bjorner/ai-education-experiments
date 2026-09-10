import { executeImage } from './index.ts';

if (import.meta.main) {
    const result = await executeImage({
        type: 'search',
        prompt: 'A red balloon on a wooden table.'
    });
    console.log(result);
}