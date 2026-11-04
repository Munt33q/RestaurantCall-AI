> ## Documentation Index
> Fetch the complete documentation index at: https://developers.telnyx.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Start Conversation Relay

> Start a Conversation Relay session on an active call. Conversation Relay connects the call audio to your WebSocket so your application can exchange realtime messages with the caller while Telnyx handles speech recognition and text-to-speech. Only one AI Assistant or Conversation Relay session can be active on a call at a time.

**Expected Webhooks:**

- `call.conversation.ended` - Sent when the Conversation Relay session ends. If the customer WebSocket disconnects, the webhook payload `reason` is `customer_disconnect`.




## OpenAPI

````yaml /openapi/source/external/call-control/call-control.json post /calls/{call_control_id}/actions/conversation_relay_start
openapi: 3.1.0
info:
  version: 2.0.0
  title: Telnyx API
  x-latency-category: interactive
  x-endpoint-cost: light
  description: SIP trunking, SMS, MMS, Call Control and Telephony Data Services.
  contact:
    email: support@telnyx.com
  x-responsible-team: squad-telephony-apps
servers:
  - url: https://api.telnyx.com/v2
    description: Version 2.0.0 of the Telnyx API
security:
  - bearerAuth: []
tags:
  - name: Call Commands
    description: Call Control command operations
  - name: Conference Commands
    description: Conference command operations
  - name: Debugging
    description: Call Control debugging
  - name: Call Information
    description: Call information
  - name: Call Control Applications
    description: Call Control applications operations
  - name: Queue Commands
    description: Queue commands operations
  - name: Text to Speech Commands
    description: Text to Speech commands operations
  - name: Callbacks
    description: Callbacks
paths:
  /calls/{call_control_id}/actions/conversation_relay_start:
    post:
      tags:
        - Call Commands
      summary: Start Conversation Relay
      description: >
        Start a Conversation Relay session on an active call. Conversation Relay
        connects the call audio to your WebSocket so your application can
        exchange realtime messages with the caller while Telnyx handles speech
        recognition and text-to-speech. Only one AI Assistant or Conversation
        Relay session can be active on a call at a time.


        **Expected Webhooks:**


        - `call.conversation.ended` - Sent when the Conversation Relay session
        ends. If the customer WebSocket disconnects, the webhook payload
        `reason` is `customer_disconnect`.
      operationId: CallStartConversationRelay
      parameters:
        - $ref: '#/components/parameters/CallControlId'
      requestBody:
        description: Conversation Relay start request
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ConversationRelayStartRequest'
      responses:
        '200':
          description: Successful response upon starting Conversation Relay.
          content:
            application/json:
              schema:
                type: object
                title: Call Control Command Response With Conversation Relay ID
                properties:
                  data:
                    $ref: >-
                      #/components/schemas/CallControlCommandResultWithConversationRelayId
        '422':
          $ref: '#/components/responses/UnprocessableEntityResponse'
        default:
          $ref: '#/components/responses/GenericErrorResponse'
      x-codeSamples:
        - lang: JavaScript
          source: >-
            import Telnyx from 'telnyx';


            const client = new Telnyx({
              apiKey: process.env['TELNYX_API_KEY'], // This is the default and can be omitted
            });


            const response = await
            client.calls.actions.startConversationRelay('call_control_id');


            console.log(response.data);
        - lang: Python
          source: |
            import os
            from telnyx import Telnyx

            client = Telnyx(
                api_key=os.environ.get("TELNYX_API_KEY"),  # This is the default and can be omitted
            )
            response = client.calls.actions.start_conversation_relay(
                call_control_id="call_control_id",
            )
            print(response.data)
        - lang: Go
          source: "package main\n\nimport (\n\t\"context\"\n\t\"fmt\"\n\n\t\"github.com/team-telnyx/telnyx-go\"\n\t\"github.com/team-telnyx/telnyx-go/option\"\n)\n\nfunc main() {\n\tclient := telnyx.NewClient(\n\t\toption.WithAPIKey(\"My API Key\"),\n\t)\n\tresponse, err := client.Calls.Actions.StartConversationRelay(\n\t\tcontext.TODO(),\n\t\t\"call_control_id\",\n\t\ttelnyx.CallActionStartConversationRelayParams{},\n\t)\n\tif err != nil {\n\t\tpanic(err.Error())\n\t}\n\tfmt.Printf(\"%+v\\n\", response.Data)\n}\n"
        - lang: Java
          source: >-
            package com.telnyx.sdk.example;


            import com.telnyx.sdk.client.TelnyxClient;

            import com.telnyx.sdk.client.okhttp.TelnyxOkHttpClient;

            import
            com.telnyx.sdk.models.calls.actions.ActionStartConversationRelayParams;

            import
            com.telnyx.sdk.models.calls.actions.ActionStartConversationRelayResponse;


            public final class Main {
                private Main() {}

                public static void main(String[] args) {
                    TelnyxClient client = TelnyxOkHttpClient.fromEnv();

                    ActionStartConversationRelayResponse response = client.calls().actions().startConversationRelay("call_control_id");
                }
            }
        - lang: Ruby
          source: >-
            require "telnyx"


            telnyx = Telnyx::Client.new(api_key: "My API Key")


            response =
            telnyx.calls.actions.start_conversation_relay("call_control_id")


            puts(response)
        - lang: PHP
          source: >-
            <?php


            require_once dirname(__DIR__) . '/vendor/autoload.php';


            use Telnyx\Client;

            use Telnyx\Core\Exceptions\APIException;


            $client = new Client(apiKey: getenv('TELNYX_API_KEY') ?: 'My API
            Key');


            try {
              $response = $client->calls->actions->startConversationRelay(
                'call_control_id',
                assistant: [
                  'dynamicVariables' => ['customer_id' => '12345', 'tier' => 'premium']
                ],
                clientState: 'aGF2ZSBhIG5pY2UgZGF5ID1d',
                commandID: '891510ac-f3e4-11e8-af5b-de00688a4901',
                conversationRelayDtmfDetection: true,
                conversationRelaySettings: [
                  'url' => 'wss://example.com/conversation-relay',
                  'dtmfDetection' => true,
                  'interruptible' => 'speech',
                  'interruptibleGreeting' => 'dtmf',
                  'languages' => [
                    [
                      'language' => 'en-US',
                      'speechModel' => 'nova-3',
                      'transcriptionEngine' => 'Deepgram',
                      'transcriptionEngineConfig' => ['transcription_model' => 'bar'],
                      'transcriptionProvider' => 'Deepgram',
                      'ttsProvider' => 'telnyx',
                      'voice' => 'Telnyx.KokoroTTS.af',
                      'voiceSettings' => [
                        'type' => 'elevenlabs', 'apiKeyRef' => 'my_elevenlabs_api_key'
                      ],
                    ],
                  ],
                ],
                conversationRelayURL: 'wss://example.com/conversation-relay',
                customParameters: ['customer_id' => 'bar'],
                dtmfDetection: true,
                greeting: 'Hi! Ask me anything!',
                interruptible: 'speech',
                interruptibleGreeting: 'dtmf',
                interruptionSettings: [
                  'enable' => true,
                  'interruptible' => 'speech',
                  'interruptibleGreeting' => 'speech',
                  'welcomeGreetingInterruptible' => 'speech',
                ],
                language: 'en-US',
                languages: [
                  [
                    'language' => 'en-US',
                    'speechModel' => 'nova-3',
                    'transcriptionEngine' => 'Deepgram',
                    'transcriptionEngineConfig' => ['transcription_model' => 'bar'],
                    'transcriptionProvider' => 'Deepgram',
                    'ttsProvider' => 'telnyx',
                    'voice' => 'Telnyx.KokoroTTS.af',
                    'voiceSettings' => [
                      'type' => 'elevenlabs', 'apiKeyRef' => 'my_elevenlabs_api_key'
                    ],
                  ],
                ],
                provider: 'elevenlabs',
                structuredProvider: ['voice_id' => 'bar', 'model_id' => 'bar'],
                transcription: ['foo' => 'bar'],
                transcriptionEngine: 'Google',
                transcriptionEngineConfig: [
                  'transcription_model' => 'bar',
                  'interim_results' => 'bar',
                  'keywords_boosting' => 'bar',
                ],
                ttsProvider: 'telnyx',
                url: 'wss://example.com/conversation-relay',
                voice: 'Telnyx.KokoroTTS.af',
                voiceSettings: ['type' => 'telnyx', 'voiceSpeed' => 1],
              );

              var_dump($response);
            } catch (APIException $e) {
              echo $e->getMessage();
            }
        - lang: CLI
          source: |-
            telnyx calls:actions start-conversation-relay \
              --api-key 'My API Key' \
              --call-control-id call_control_id
components:
  parameters:
    CallControlId:
      name: call_control_id
      description: Unique identifier and token for controlling the call
      in: path
      required: true
      schema:
        type: string
  schemas:
    ConversationRelayStartRequest:
      type: object
      title: Conversation Relay Start Request
      description: >-
        Start a Conversation Relay session. A WebSocket URL is required: provide
        it as `url`, `conversation_relay_url`, or
        `conversation_relay_settings.url`; top-level values take precedence over
        nested settings. Use `transcription_engine` and
        `transcription_engine_config` for speech-to-text configuration; the
        `transcription` object is not supported.
      properties:
        conversation_relay_settings:
          $ref: '#/components/schemas/ConversationRelaySettings'
        url:
          type: string
          pattern: ^wss?://
          description: >-
            Public alias for `conversation_relay_url`. Must start with `ws://`
            or `wss://`. If both are present, this value wins.
          example: wss://example.com/conversation-relay
        dtmf_detection:
          type: boolean
          description: >-
            Public alias for `conversation_relay_dtmf_detection`. If both are
            present, this value wins.
          default: false
          example: true
        conversation_relay_url:
          type: string
          pattern: ^wss?://
          description: >-
            WebSocket URL for your Conversation Relay server. Must start with
            `ws://` or `wss://`.
          example: wss://example.com/conversation-relay
        conversation_relay_dtmf_detection:
          type: boolean
          description: Enable DTMF detection for the relay session.
          default: false
          example: true
        voice:
          $ref: '#/components/schemas/VoiceConfig'
        voice_settings:
          description: The settings associated with the voice selected
          oneOf:
            - $ref: '#/components/schemas/ElevenLabsVoiceSettings'
            - $ref: '#/components/schemas/TelnyxVoiceSettings'
            - $ref: '#/components/schemas/AWSVoiceSettings'
            - $ref: '#/components/schemas/MinimaxVoiceSettings'
            - $ref: '#/components/schemas/AzureVoiceSettings'
            - $ref: '#/components/schemas/ResembleVoiceSettings'
            - $ref: '#/components/schemas/InworldVoiceSettings'
            - $ref: '#/components/schemas/XAIVoiceSettings'
            - $ref: '#/components/schemas/SonioxVoiceSettings'
            - $ref: '#/components/schemas/AssemblyAIVoiceSettings'
          discriminator:
            propertyName: type
            mapping:
              elevenlabs: '#/components/schemas/ElevenLabsVoiceSettings'
              telnyx: '#/components/schemas/TelnyxVoiceSettings'
              aws: '#/components/schemas/AWSVoiceSettings'
              minimax: '#/components/schemas/MinimaxVoiceSettings'
              azure: '#/components/schemas/AzureVoiceSettings'
              resemble: '#/components/schemas/ResembleVoiceSettings'
              inworld: '#/components/schemas/InworldVoiceSettings'
              xai: '#/components/schemas/XAIVoiceSettings'
              soniox: '#/components/schemas/SonioxVoiceSettings'
              assemblyai: '#/components/schemas/AssemblyAIVoiceSettings'
        greeting:
          type: string
          description: Text played when the relay session starts.
          example: Hi! Ask me anything!
        language:
          type: string
          description: >-
            Default language for the relay session. This value is used for both
            text-to-speech and speech recognition.
          default: en
          example: en-US
        languages:
          type: array
          description: Per-language TTS and transcription settings.
          items:
            $ref: '#/components/schemas/ConversationRelayLanguage'
        interruption_settings:
          $ref: '#/components/schemas/ConversationRelayInterruptionSettings'
        transcription:
          type: object
          deprecated: true
          description: >-
            Not supported for Conversation Relay start requests. Use
            `transcription_engine` and `transcription_engine_config` instead.
          additionalProperties: true
        assistant:
          $ref: '#/components/schemas/ConversationRelayAssistant'
        client_state:
          type: string
          description: >-
            Use this field to add state to subsequent webhooks. It must be a
            valid Base-64 encoded string.
          example: aGF2ZSBhIG5pY2UgZGF5ID1d
        command_id:
          description: >-
            Use this field to avoid duplicate commands. Telnyx will ignore any
            command with the same `command_id` for the same `call_control_id`.
          type: string
          example: 891510ac-f3e4-11e8-af5b-de00688a4901
        tts_provider:
          type: string
          description: >-
            Text-to-speech provider. If omitted, Telnyx derives it from `voice`
            or `provider`.
          example: telnyx
        provider:
          type: string
          description: >-
            Structured voice provider. Must be supplied together with
            `structured_provider`.
          example: elevenlabs
        structured_provider:
          $ref: '#/components/schemas/ConversationRelayStructuredProvider'
        transcription_engine:
          description: >-
            Engine to use for speech recognition. Legacy values `A` - `Google`,
            `B` - `Telnyx` are supported for backward compatibility. For
            Conversation Relay, use this field with
            `transcription_engine_config`; the `transcription` object is not
            supported.
          type: string
          enum:
            - Google
            - Telnyx
            - Deepgram
            - Azure
            - xAI
            - AssemblyAI
            - Speechmatics
            - Soniox
            - A
            - B
          default: Google
          example: Google
        transcription_engine_config:
          $ref: '#/components/schemas/ConversationRelayTranscriptionEngineConfig'
        interruptible:
          $ref: '#/components/schemas/ConversationRelayInterruptible'
        interruptible_greeting:
          $ref: '#/components/schemas/ConversationRelayInterruptible'
        custom_parameters:
          type: object
          description: >-
            Custom key-value parameters forwarded to the relay session as
            `assistant.dynamic_variables`. If `assistant.dynamic_variables` is
            also present, these values are merged in.
          additionalProperties: true
          example:
            customer_id: '12345'
      example:
        url: wss://example.com/conversation-relay
        dtmf_detection: true
        interruptible: speech
        interruptible_greeting: dtmf
        greeting: Hi! Ask me anything!
        voice: Telnyx.KokoroTTS.af
        tts_provider: telnyx
        voice_settings:
          type: telnyx
        language: en-US
        languages:
          - language: en-US
            tts_provider: telnyx
            voice: Telnyx.KokoroTTS.af
            transcription_engine: Deepgram
            transcription_engine_config:
              transcription_model: deepgram/nova-3
        custom_parameters:
          customer_id: '12345'
      allOf:
        - if:
            not:
              anyOf:
                - properties:
                    url:
                      type: string
                  required:
                    - url
                - properties:
                    conversation_relay_url:
                      type: string
                  required:
                    - conversation_relay_url
          then:
            properties:
              conversation_relay_settings:
                type: object
            required:
              - conversation_relay_settings
    CallControlCommandResultWithConversationRelayId:
      type: object
      title: Call Control Command Result With Conversation Relay ID
      example:
        result: ok
        conversation_relay_id: d7e9c1d4-8b2a-4b8f-b3a7-9a671c9e9b0a
      properties:
        result:
          type: string
          example: ok
        conversation_relay_id:
          type: string
          example: d7e9c1d4-8b2a-4b8f-b3a7-9a671c9e9b0a
          description: The ID of the Conversation Relay session created by the command.
    ConversationRelaySettings:
      type: object
      title: Conversation Relay Settings
      description: >-
        Conversation Relay connection settings. This object can provide `url`,
        `dtmf_detection`, `interruptible`, `interruptible_greeting`, and
        `languages`. Top-level aliases override nested values when both are
        present.
      properties:
        url:
          type: string
          pattern: ^wss?://
          description: >-
            WebSocket URL for your Conversation Relay server. Must start with
            `ws://` or `wss://`.
          example: wss://example.com/conversation-relay
        dtmf_detection:
          type: boolean
          description: Whether to enable DTMF detection during the relay session.
          default: false
          example: true
        interruptible:
          $ref: '#/components/schemas/ConversationRelayInterruptible'
        interruptible_greeting:
          $ref: '#/components/schemas/ConversationRelayInterruptible'
        languages:
          type: array
          description: Language-specific TTS and transcription settings.
          items:
            $ref: '#/components/schemas/ConversationRelayLanguage'
      required:
        - url
      example:
        url: wss://example.com/conversation-relay
        dtmf_detection: true
        interruptible: speech
        interruptible_greeting: dtmf
        languages:
          - language: en-US
            tts_provider: telnyx
            voice: Telnyx.KokoroTTS.af
            transcription_engine: Deepgram
            transcription_engine_config:
              transcription_model: deepgram/nova-3
    VoiceConfig:
      description: >-
        The voice to be used by the voice assistant. Currently we support
        ElevenLabs, Telnyx and AWS voices.

         **Supported Providers:**
        - **AWS:** Use `AWS.Polly.<VoiceId>` (e.g., `AWS.Polly.Joanna`). For
        neural voices, which provide more realistic, human-like speech, append
        `-Neural` to the `VoiceId` (e.g., `AWS.Polly.Joanna-Neural`). Check the
        [available
        voices](https://docs.aws.amazon.com/polly/latest/dg/available-voices.html)
        for compatibility.

        - **Azure:** Use `Azure.<VoiceId>` (e.g., `Azure.en-CA-ClaraNeural`,
        `Azure.en-CA-LiamNeural`, `Azure.en-US-BrianMultilingualNeural`,
        `Azure.en-US-Ava:DragonHDLatestNeural`). For a complete list of voices,
        go to [Azure Voice
        Gallery](https://speech.microsoft.com/portal/voicegallery).

        - **ElevenLabs:** Use `ElevenLabs.<ModelId>.<VoiceId>` (e.g.,
        `ElevenLabs.BaseModel.John`). The `ModelId` part is optional. To use
        ElevenLabs, you must provide your ElevenLabs API key as an integration
        secret under `"voice_settings": {"api_key_ref": "<secret_id>"}`. See
        [integration secrets
        documentation](https://developers.telnyx.com/api/secrets-manager/integration-secrets/create-integration-secret)
        for details. Check [available
        voices](https://elevenlabs.io/docs/api-reference/get-voices).
         - **Telnyx:** Use `Telnyx.<model_id>.<voice_id>`
        - **Inworld:** Use `Inworld.<ModelId>.<VoiceId>` (e.g.,
        `Inworld.Mini.Loretta`, `Inworld.Max.Oliver`, `Inworld.TTS2.Loretta`).
        Supported models: `Mini`, `Max`, `TTS2`.

        - **Fish Audio:** Use `FishAudio.<ModelId>.<VoiceId>` (e.g.,
        `FishAudio.s2.1-pro.<reference_id>`). Supported models: `s2.1-pro`,
        `s2-pro`, `s1`. `VoiceId` is a Fish Voice-Library reference ID.

        - **Soniox:** Use `Soniox.<ModelId>.<VoiceId>` (e.g.,
        `Soniox.tts-rt-v2.Emma`). Supported model: `tts-rt-v2`. Browse the
        catalog via the [Voices
        API](https://developers.telnyx.com/api-reference/text-to-speech-commands/list-available-voices).
        Every voice speaks all supported languages; set `language` to the
        two-letter ISO 639-1 code of the text, for example `it`. SSML is not
        supported. Use `voice_settings` to configure `speed` (0.7 to 1.3) and
        `reduce_silence`.

        - **xAI:** Use `xAI.<VoiceId>` (e.g., `xAI.eve`). Available voices:
        `eve`, `ara`, `rex`, `sal`, `leo`.

        - **Humain:** Use `Humain.<VoiceId>` (e.g., `Humain.sara-ar`). Available
        voices: `sara-en`, `abdulaziz-en`, `sara-ar`, `abdulaziz-ar`,
        `nourah-ar`, `abdullah-ar`. Native Arabic (Saudi dialect) and English
        voices only — no `ModelId` segment.
      type: string
      default: Telnyx.KokoroTTS.af
      example: Telnyx.KokoroTTS.af
    ElevenLabsVoiceSettings:
      type: object
      title: ElevenLabs Voice Settings
      properties:
        type:
          type: string
          enum:
            - elevenlabs
          description: Voice settings provider type
        api_key_ref:
          description: >-
            The `identifier` for an integration secret
            [/v2/integration_secrets](https://developers.telnyx.com/api/secrets-manager/integration-secrets/create-integration-secret)
            that refers to your ElevenLabs API key. Warning: Free plans are
            unlikely to work with this integration.
          type: string
          example: my_elevenlabs_api_key
      required:
        - type
    TelnyxVoiceSettings:
      type: object
      title: Telnyx Voice Settings
      properties:
        type:
          type: string
          enum:
            - telnyx
          description: Voice settings provider type
        voice_speed:
          description: >-
            The voice speed to be used for the voice. Telnyx `Ultra` voices
            accept values from 0.6 to 1.5; values outside that range are
            rejected by the synthesis engine. `Qwen3TTS` and `KokoroTTS` accept
            the field but do not apply it. Default value is 1.0. Not supported
            for `Telnyx.Bayan.*` or `Telnyx.Sukhan.*` voices.
          type: number
          default: 1
          format: float
          example: 1
          minimum: 0.1
          maximum: 2
      required:
        - type
    AWSVoiceSettings:
      type: object
      title: AWS Voice Settings
      properties:
        type:
          type: string
          enum:
            - aws
          description: Voice settings provider type
      required:
        - type
    MinimaxVoiceSettings:
      type: object
      title: Minimax Voice Settings
      properties:
        type:
          type: string
          enum:
            - minimax
          description: Voice settings provider type
        speed:
          description: Speech speed multiplier. Default is 1.0.
          type: number
          format: float
          example: 1
          default: 1
        vol:
          description: Speech volume multiplier. Default is 1.0.
          type: number
          format: float
          example: 1
          default: 1
        pitch:
          description: Voice pitch adjustment. Default is 0.
          type: integer
          example: 0
          default: 0
        language_boost:
          type:
            - string
            - 'null'
          description: >-
            Enhances recognition for specific languages and dialects during
            MiniMax TTS synthesis. Default is null (no boost). Set to 'auto' for
            automatic language detection.
          enum:
            - null
            - auto
            - Chinese
            - Chinese,Yue
            - English
            - Arabic
            - Russian
            - Spanish
            - French
            - Portuguese
            - German
            - Turkish
            - Dutch
            - Ukrainian
            - Vietnamese
            - Indonesian
            - Japanese
            - Italian
            - Korean
            - Thai
            - Polish
            - Romanian
            - Greek
            - Czech
            - Finnish
            - Hindi
            - Bulgarian
            - Danish
            - Hebrew
            - Malay
            - Persian
            - Slovak
            - Swedish
            - Croatian
            - Filipino
            - Hungarian
            - Norwegian
            - Slovenian
            - Catalan
            - Nynorsk
            - Tamil
            - Afrikaans
          default: null
      required:
        - type
    AzureVoiceSettings:
      type: object
      title: Azure Voice Settings
      properties:
        type:
          type: string
          enum:
            - azure
          description: Voice settings provider type
        api_key_ref:
          description: >-
            The `identifier` for an integration secret that refers to your Azure
            Speech API key.
          type: string
          example: my_azure_api_key
        region:
          description: >-
            The Azure region for the Speech service (e.g., `eastus`,
            `westeurope`). Required when using a custom API key.
          type: string
          example: eastus
        deployment_id:
          description: The deployment ID for a custom Azure neural voice.
          type: string
          example: my-custom-voice-deployment
        effect:
          description: Audio effect to apply.
          type: string
          enum:
            - eq_car
            - eq_telecomhp8k
        gender:
          description: Voice gender filter.
          type: string
          enum:
            - Male
            - Female
      required:
        - type
    ResembleVoiceSettings:
      type: object
      title: Resemble Voice Settings
      properties:
        type:
          type: string
          enum:
            - resemble
          description: Voice settings provider type
        precision:
          description: Audio precision format.
          type: string
          enum:
            - PCM_16
            - PCM_24
            - PCM_32
            - MULAW
          default: PCM_32
        sample_rate:
          $ref: '#/components/schemas/ResembleSampleRate'
        format:
          description: Output audio format.
          type: string
          enum:
            - wav
            - mp3
          default: mp3
      required:
        - type
    InworldVoiceSettings:
      type: object
      title: Inworld Voice Settings
      properties:
        type:
          type: string
          enum:
            - inworld
          description: Voice settings provider type
        delivery_mode:
          type: string
          enum:
            - STABLE
            - BALANCED
            - CREATIVE
          description: >-
            Controls the expressiveness and consistency of the Inworld `TTS2`
            model's speech synthesis. `STABLE` favors consistent, predictable
            output, `CREATIVE` allows more expressive variation, and `BALANCED`
            sits in between. Optional and only supported by `TTS2`; when
            omitted, the provider default applies.
      required:
        - type
    XAIVoiceSettings:
      type: object
      title: xAI Voice Settings
      properties:
        type:
          type: string
          enum:
            - xai
          description: Voice settings provider type
        language:
          description: Language code, or `auto` to detect automatically.
          type: string
          default: auto
      required:
        - type
    SonioxVoiceSettings:
      type: object
      title: Soniox Voice Settings
      properties:
        type:
          type: string
          enum:
            - soniox
          description: Voice settings provider type
        speed:
          type: number
          format: float
          minimum: 0.7
          maximum: 1.3
          default: 1
          description: Speaking rate. 1.0 is normal speed.
        reduce_silence:
          type: boolean
          default: false
          description: Shortens the pauses between words.
      required:
        - type
    AssemblyAIVoiceSettings:
      type: object
      title: AssemblyAI Voice Settings
      properties:
        type:
          type: string
          enum:
            - assemblyai
          description: Voice settings provider type
      required:
        - type
    ConversationRelayLanguage:
      type: object
      title: Conversation Relay Language
      description: Language-specific TTS and transcription settings for Conversation Relay.
      properties:
        language:
          type: string
          description: BCP 47 language tag for this language configuration.
          example: en-US
        tts_provider:
          type: string
          description: >-
            Text-to-speech provider for this language. If omitted and `voice` is
            provided, Telnyx derives the provider from the voice identifier.
          example: telnyx
        voice:
          type: string
          description: Voice identifier for this language.
          example: Telnyx.KokoroTTS.af
        voice_settings:
          description: The settings associated with the voice selected
          oneOf:
            - $ref: '#/components/schemas/ElevenLabsVoiceSettings'
            - $ref: '#/components/schemas/TelnyxVoiceSettings'
            - $ref: '#/components/schemas/AWSVoiceSettings'
            - $ref: '#/components/schemas/MinimaxVoiceSettings'
            - $ref: '#/components/schemas/AzureVoiceSettings'
            - $ref: '#/components/schemas/ResembleVoiceSettings'
            - $ref: '#/components/schemas/InworldVoiceSettings'
            - $ref: '#/components/schemas/XAIVoiceSettings'
            - $ref: '#/components/schemas/SonioxVoiceSettings'
            - $ref: '#/components/schemas/AssemblyAIVoiceSettings'
          discriminator:
            propertyName: type
            mapping:
              elevenlabs: '#/components/schemas/ElevenLabsVoiceSettings'
              telnyx: '#/components/schemas/TelnyxVoiceSettings'
              aws: '#/components/schemas/AWSVoiceSettings'
              minimax: '#/components/schemas/MinimaxVoiceSettings'
              azure: '#/components/schemas/AzureVoiceSettings'
              resemble: '#/components/schemas/ResembleVoiceSettings'
              inworld: '#/components/schemas/InworldVoiceSettings'
              xai: '#/components/schemas/XAIVoiceSettings'
              soniox: '#/components/schemas/SonioxVoiceSettings'
              assemblyai: '#/components/schemas/AssemblyAIVoiceSettings'
        transcription_engine:
          description: >-
            Engine to use for speech recognition. Legacy values `A` - `Google`,
            `B` - `Telnyx` are supported for backward compatibility. When
            provided in a Conversation Relay language entry, Telnyx derives
            `transcription_provider` and `speech_model` for that language.
          type: string
          enum:
            - Google
            - Telnyx
            - Deepgram
            - Azure
            - xAI
            - AssemblyAI
            - Speechmatics
            - Soniox
            - A
            - B
          default: Google
          example: Google
        transcription_engine_config:
          $ref: '#/components/schemas/ConversationRelayTranscriptionEngineConfig'
        transcription_provider:
          type: string
          description: >-
            Conversation Relay transcription provider name. Prefer
            `transcription_engine` when configuring speech-to-text.
          example: Deepgram
        speech_model:
          type: string
          description: >-
            Conversation Relay speech model. Prefer
            `transcription_engine_config.transcription_model` when configuring
            speech-to-text.
          example: nova-3
      required:
        - language
    ConversationRelayInterruptionSettings:
      type: object
      title: Conversation Relay Interruption Settings
      description: >-
        Settings for handling caller interruptions during Conversation Relay
        speech.
      properties:
        enable:
          type: boolean
          description: >-
            Legacy boolean form. `true` is equivalent to `interruptible=any`;
            `false` is equivalent to `interruptible=none`.
        interruptible:
          $ref: '#/components/schemas/ConversationRelayInterruptible'
        interruptible_greeting:
          $ref: '#/components/schemas/ConversationRelayInterruptible'
        welcome_greeting_interruptible:
          $ref: '#/components/schemas/ConversationRelayInterruptible'
    ConversationRelayAssistant:
      type: object
      title: Conversation Relay Custom Parameters
      description: >-
        Custom parameters for the Conversation Relay session. Pass key-value
        data as `assistant.dynamic_variables` to make it available to the relay
        session.
      properties:
        dynamic_variables:
          type: object
          description: >-
            Custom key-value parameters forwarded to the Conversation Relay
            session.
          additionalProperties:
            type: string
          example:
            customer_id: '12345'
            tier: premium
      additionalProperties: true
    ConversationRelayStructuredProvider:
      type: object
      title: Conversation Relay Structured Provider
      description: >-
        Provider-specific structured voice settings. Must be supplied together
        with `provider`; Telnyx sends the value as the nested provider
        configuration for Conversation Relay.
      additionalProperties: true
      example:
        voice_id: voice-id
        model_id: Default
    ConversationRelayTranscriptionEngineConfig:
      type: object
      title: Conversation Relay Transcription Engine Config
      description: >-
        Engine-specific transcription settings for Conversation Relay. This
        accepts the same provider-specific options used by the Call
        Transcription Start command, such as `transcription_model`, without
        requiring the engine discriminator to be repeated inside this object.
        With Deepgram Flux (`deepgram/flux`), `interim_results`, `eot_threshold`
        and `eager_eot_threshold` control the interim prompts and the
        `eagerEndOfTurn` and `turnResumed` frames sent to your WebSocket server.
      properties:
        interim_results:
          type: boolean
          default: false
          description: >-
            Deepgram Flux: send interim transcripts as `prompt` frames with
            `last: false`.
        eot_threshold:
          type: number
          minimum: 0.5
          maximum: 0.9
          default: 0.7
          description: 'Deepgram Flux: confidence required to end the caller''s turn.'
        eager_eot_threshold:
          type: number
          minimum: 0.3
          maximum: 0.7
          description: >-
            Deepgram Flux: confidence at which an `eagerEndOfTurn` frame is sent
            before the final prompt, followed by `turnResumed` if the caller
            keeps talking. When omitted, these frames are not sent.
      additionalProperties: true
      example:
        transcription_model: deepgram/flux
        interim_results: true
        eager_eot_threshold: 0.5
    ConversationRelayInterruptible:
      type: string
      description: >-
        Controls when caller input can interrupt assistant speech. `any` allows
        speech or DTMF interruptions; `none` disables interruptions; `speech`
        allows speech only; `dtmf` allows DTMF only.
      enum:
        - none
        - any
        - speech
        - dtmf
      default: any
      example: speech
    Errors:
      properties:
        errors:
          type: array
          items:
            $ref: '#/components/schemas/Error'
    ResembleSampleRate:
      type: string
      title: Resemble Sample Rate
      description: Audio sample rate in Hz.
      enum:
        - '8000'
        - '16000'
        - '22050'
        - '32000'
        - '44100'
        - '48000'
      default: '48000'
    Error:
      required:
        - code
        - title
      properties:
        code:
          type: string
          format: integer
        title:
          type: string
        detail:
          type: string
        source:
          type: object
          properties:
            pointer:
              description: JSON pointer (RFC6901) to the offending entity.
              type: string
              format: json-pointer
            parameter:
              description: Indicates which query parameter caused the error.
              type: string
        meta:
          type: object
  responses:
    UnprocessableEntityResponse:
      description: >-
        Unprocessable entity. The request was well-formed but could not be
        processed due to semantic errors. This includes validation errors,
        invalid parameter values, call state errors, conference errors, queue
        errors, recording/transcription errors, and business logic violations.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Errors'
          examples:
            missing_required_parameter:
              summary: Missing required parameter
              value:
                errors:
                  - code: '10004'
                    title: Missing required parameter
                    detail: The 'to' parameter is required and cannot be blank.
                    source:
                      pointer: /to
            invalid_call_control_id:
              summary: Invalid call control ID
              value:
                errors:
                  - code: '90015'
                    title: Invalid Call Control ID
                    detail: The call_control_id provided was not valid.
                    source:
                      pointer: /call_control_id
            call_already_ended:
              summary: Call has already ended
              value:
                errors:
                  - code: '90018'
                    title: Call has already ended
                    detail: This call is no longer active and can't receive commands.
            call_not_answered:
              summary: Call not answered yet
              value:
                errors:
                  - code: '90034'
                    title: Call not answered yet
                    detail: >-
                      This call can't receive this command because it has not
                      been answered yet.
            cannot_record_before_audio_started:
              summary: Cannot record before audio started
              value:
                errors:
                  - code: '90020'
                    title: Call recording triggered before audio started
                    detail: >-
                      Call recording cannot be started until audio has commenced
                      on the call.
            transcription_already_active:
              summary: Transcription already active
              value:
                errors:
                  - code: '90054'
                    title: Call transcription is already in progress
                    detail: Call transcription can not be started more than once.
            ai_assistant_already_active:
              summary: AI Assistant already active
              value:
                errors:
                  - code: '90061'
                    title: AI Assistant is already in progress
                    detail: AI Assistant cannot be started more than once.
            conference_already_ended:
              summary: Conference has already ended
              value:
                errors:
                  - code: '90019'
                    title: Conference has already ended
                    detail: >-
                      This conference is no longer active and can't receive
                      commands.
            conference_name_conflict:
              summary: Conference name conflict
              value:
                errors:
                  - code: '90033'
                    title: Unable to execute command
                    detail: Conference with given name already exists and it's active.
            max_participants_reached:
              summary: Maximum participants reached
              value:
                errors:
                  - code: '90032'
                    title: Maximum number of participants reached
                    detail: >-
                      The maximum allowed value of `max_participants` has been
                      reached at 100.
            queue_full:
              summary: Queue is full
              value:
                errors:
                  - code: '90036'
                    title: Queue full
                    detail: The 'support' queue is full and can't accept more calls.
            call_already_in_queue:
              summary: Call already in queue
              value:
                errors:
                  - code: '90038'
                    title: Call already in queue
                    detail: Call can't be added to a queue it's already in.
            invalid_connection_id:
              summary: Invalid connection ID
              value:
                errors:
                  - code: '10015'
                    title: Invalid value for connection_id (Call Control App ID)
                    detail: >-
                      The requested connection_id (Call Control App ID) is
                      either invalid or does not exist. Only Call Control Apps
                      with valid webhook URL are accepted.
                    source:
                      pointer: /connection_id
            invalid_phone_number_format:
              summary: Invalid phone number format
              value:
                errors:
                  - code: '10016'
                    title: Phone number must be in +E164 format
                    detail: The 'to' parameter must be in E164 format.
                    source:
                      pointer: /to
            srtp_not_supported_for_pstn:
              summary: SRTP not supported for PSTN calls
              value:
                errors:
                  - source:
                      pointer: /media_encryption
                    title: Media encryption not supported for PSTN calls
                    detail: SRTP media encryption is not supported for PSTN calls.
                    code: '10011'
            fork_not_found:
              summary: Call is not forked
              value:
                errors:
                  - code: '90031'
                    title: Call is not currently forked
                    detail: >-
                      Can't stop forking, because the call isn't currently
                      forked.
            media_streaming_used:
              summary: Media streaming in use
              value:
                errors:
                  - code: '90045'
                    title: Media Streaming is used
                    detail: This command can't be issued when media streaming is used.
            invalid_enumerated_value:
              summary: Invalid enumerated value
              value:
                errors:
                  - code: '10032'
                    title: Invalid enumerated value
                    detail: 'The value must be one of: dual, single.'
                    source:
                      pointer: /record_channels
            value_outside_range:
              summary: Value outside of range
              value:
                errors:
                  - code: '10033'
                    title: Value outside of range
                    detail: The value is outside of allowed range 1 to 5000
                    source:
                      pointer: /max_participants
    GenericErrorResponse:
      description: Unexpected error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Errors'
          example:
            errors:
              - code: '10007'
                title: Unexpected error
                detail: An unexpected error occured.
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer

````