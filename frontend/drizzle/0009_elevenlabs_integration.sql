ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS elevenlabs_conversation_id text;
CREATE UNIQUE INDEX IF NOT EXISTS call_sessions_elevenlabs_conversation_unique
  ON call_sessions(elevenlabs_conversation_id)
  WHERE elevenlabs_conversation_id IS NOT NULL;
