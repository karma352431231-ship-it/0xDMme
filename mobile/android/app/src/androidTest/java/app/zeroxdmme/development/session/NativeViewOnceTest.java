package app.zeroxdmme.development.session;

import static org.junit.Assert.*;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import app.zeroxdmme.development.MainActivity;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;

/** Synthetic native rendering only; no account, wallet, server or private history. */
public class NativeViewOnceTest {
    @Test public void secureWindowClosesAndRevokesItsNativeCapability() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<Throwable> failure = new AtomicReference<>();
            scenario.onActivity(activity -> {
                try {
                    boolean original = (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
                    AtomicReference<Boolean> active = new AtomicReference<>(false);
                    NativeViewOnce owner = new NativeViewOnce(new WebView(activity), active::set);
                    String id = UUID.randomUUID().toString();
                    JSONObject reference = new JSONObject().put("id",id);
                    assertEquals(true, owner.dispatch("view-begin",new JSONObject().put("id",id).put("mime","text/plain").put("bytes",0)));
                    assertTrue(active.get());
                    assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
                    assertEquals(true, owner.dispatch("view-show",new JSONObject().put("id",id).put("text","Synthetic protected message")));
                    assertEquals(true, owner.dispatch("view-active",reference));
                    owner.close();
                    assertFalse(active.get());
                    assertEquals(false, owner.dispatch("view-active",reference));
                    assertEquals(original,(activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
                    assertThrows(Exception.class, () -> owner.dispatch("view-show",new JSONObject().put("id",id).put("text","Cannot reopen")));
                    assertThrows(Exception.class, () -> owner.dispatch("view-begin",new JSONObject().put("id",id).put("mime","text/html").put("bytes",12)));
                } catch(Throwable error) {failure.set(error);}
            });
            if(failure.get()!=null) throw new AssertionError(failure.get());
        }
    }
}
