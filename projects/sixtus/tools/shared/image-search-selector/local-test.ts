import { imageSearchSelector } from "./index.ts";

if (import.meta.main) {
    const result = await imageSearchSelector({
        prompt: "Current photo of Swedish prime mininster portrait",
        mode: "smart",
        maxCandidates: 6,
        size: "large",
        requireDownloadable: false,
    });
    console.log(result);    
}

/*

example prompts:
- photo for an article about the US women's victory against Canada in the olympics final
- Pope Leo looking smiling and looking happy
- Adidas x Entire Studios Lightblaze POD Shoes
- Swedish prime mininster portrait
- cool photo of Drake Maye for a social media post
- photo from norway vs brazil in the world cup
- Current photo of Swedish prime mininster portrait

*/
