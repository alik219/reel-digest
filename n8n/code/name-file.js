// n8n Code node "Name file" (mode: Run Once for Each Item).
// Groq decides the file type from its name, and download links don't always end
// in .mp4, so give the downloaded file a name it accepts.

$input.item.binary.data.fileName = 'reel.mp4';
return $input.item;
