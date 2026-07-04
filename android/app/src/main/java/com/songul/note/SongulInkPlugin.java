package com.songul.note;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.Ink;
import com.google.mlkit.vision.digitalink.RecognitionCandidate;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Bridges SonGul stroke data to ML Kit Digital Ink Recognition.
 * All heavy work runs on ML Kit's own background executor; plugin calls
 * resolve asynchronously so the WebView never blocks.
 */
@CapacitorPlugin(name = "SongulInk")
public class SongulInkPlugin extends Plugin {

    private DigitalInkRecognizer recognizer;
    private String recognizerLang;

    private DigitalInkRecognitionModel modelFor(String language) {
        try {
            DigitalInkRecognitionModelIdentifier id =
                DigitalInkRecognitionModelIdentifier.fromLanguageTag(language);
            if (id == null) return null;
            return DigitalInkRecognitionModel.builder(id).build();
        } catch (MlKitException e) {
            return null;
        }
    }

    @PluginMethod
    public void ensureModel(PluginCall call) {
        String language = call.getString("language", "ko");
        DigitalInkRecognitionModel model = modelFor(language);
        if (model == null) {
            call.reject("unsupported language: " + language);
            return;
        }
        RemoteModelManager manager = RemoteModelManager.getInstance();
        manager.isModelDownloaded(model)
            .addOnSuccessListener(downloaded -> {
                if (Boolean.TRUE.equals(downloaded)) {
                    JSObject ret = new JSObject();
                    ret.put("status", "downloaded");
                    call.resolve(ret);
                } else {
                    manager.download(model, new DownloadConditions.Builder().build())
                        .addOnSuccessListener(v -> {
                            JSObject ret = new JSObject();
                            ret.put("status", "downloaded");
                            call.resolve(ret);
                        })
                        .addOnFailureListener(e -> {
                            JSObject ret = new JSObject();
                            ret.put("status", "failed");
                            ret.put("message", String.valueOf(e.getMessage()));
                            call.resolve(ret);
                        });
                }
            })
            .addOnFailureListener(e -> call.reject("model check failed: " + e.getMessage()));
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String language = call.getString("language", "ko");
        JSArray strokesIn = call.getArray("strokes");
        if (strokesIn == null || strokesIn.length() == 0) {
            call.reject("strokes required");
            return;
        }
        Ink ink;
        try {
            Ink.Builder inkBuilder = Ink.builder();
            for (int i = 0; i < strokesIn.length(); i++) {
                JSONObject strokeObj = strokesIn.getJSONObject(i);
                JSONArray points = strokeObj.getJSONArray("points");
                Ink.Stroke.Builder sb = Ink.Stroke.builder();
                for (int j = 0; j < points.length(); j++) {
                    JSONObject pt = points.getJSONObject(j);
                    sb.addPoint(Ink.Point.create(
                        (float) pt.getDouble("x"),
                        (float) pt.getDouble("y"),
                        pt.optLong("t", 0)));
                }
                inkBuilder.addStroke(sb.build());
            }
            ink = inkBuilder.build();
        } catch (JSONException e) {
            call.reject("bad strokes payload: " + e.getMessage());
            return;
        }
        DigitalInkRecognizer rec = recognizerFor(language);
        if (rec == null) {
            call.reject("unsupported language: " + language);
            return;
        }
        rec.recognize(ink)
            .addOnSuccessListener(result -> {
                JSArray candidates = new JSArray();
                for (RecognitionCandidate c : result.getCandidates()) {
                    JSObject item = new JSObject();
                    item.put("text", c.getText());
                    if (c.getScore() != null) item.put("score", c.getScore());
                    candidates.put(item);
                }
                JSObject ret = new JSObject();
                ret.put("candidates", candidates);
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject("recognition failed: " + e.getMessage()));
    }

    private synchronized DigitalInkRecognizer recognizerFor(String language) {
        if (recognizer == null || !language.equals(recognizerLang)) {
            DigitalInkRecognitionModel model = modelFor(language);
            if (model == null) return null;
            if (recognizer != null) recognizer.close();
            recognizer = DigitalInkRecognition.getClient(
                DigitalInkRecognizerOptions.builder(model).build());
            recognizerLang = language;
        }
        return recognizer;
    }
}
