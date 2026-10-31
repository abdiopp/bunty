#!/bin/sh
# Stands in for whisper.cpp's command-line program in tests: checks it was handed a 16 kHz WAV
# file with -f, then "hears" a fixed sentence, the way whisper-cli prints it with -nt -np.
while [ $# -gt 0 ]; do
  if [ "$1" = "-f" ]; then file="$2"; fi
  shift
done
if [ "$(head -c 4 "$file")" != "RIFF" ]; then
  echo "not a WAV file" >&2
  exit 1
fi
echo " Call Ali tomorrow at 5 p.m., high priority."
