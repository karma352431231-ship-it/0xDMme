package app.zeroxdmme.development.media;

import static org.junit.Assert.*;
import android.Manifest;
import android.net.Uri;
import android.webkit.PermissionRequest;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Arrays;
import org.junit.Test;

/** Exercises permission admission and cancellation without requesting real media. */
public class NativeMediaPermissionsTest {
    private static final class Prompt implements NativeMediaPermissions.Prompt {
        boolean granted;
        boolean closed;
        int launches;
        String[] requested;
        @Override public boolean granted(String permission) { return granted; }
        @Override public void launch(String[] permissions) { launches++; requested = permissions; }
        @Override public void close() { closed = true; }
    }

    private static final class Request extends PermissionRequest {
        final Uri origin;
        final String[] resources;
        int denials;
        int grants;
        String[] approved;
        Request(String origin, String... resources) { this.origin = Uri.parse(origin); this.resources = resources; }
        @Override public Uri getOrigin() { return origin; }
        @Override public String[] getResources() { return resources; }
        @Override public void grant(String[] resources) { grants++; approved = resources; }
        @Override public void deny() { denials++; }
    }

    private static Request audio() {
        return new Request("https://localhost", PermissionRequest.RESOURCE_AUDIO_CAPTURE);
    }

    @Test public void rejectsUntrustedOriginsDocumentsAndUnknownResourcesWithoutOsPrompt() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Prompt prompt = new Prompt();
            NativeMediaPermissions owner = new NativeMediaPermissions(() -> "https://localhost/#conversas", prompt);
            for (String origin : Arrays.asList("https://external.invalid", "http://localhost", "https://localhost:444", "https://localhost/remote", "https://user@localhost")) {
                Request request = new Request(origin, PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                owner.request(request);
                assertEquals(1, request.denials);
                assertEquals(0, request.grants);
            }
            for (String[] resources : new String[][] {{}, {PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID},
                {PermissionRequest.RESOURCE_AUDIO_CAPTURE, "unknown.future.resource"},
                {PermissionRequest.RESOURCE_AUDIO_CAPTURE, PermissionRequest.RESOURCE_AUDIO_CAPTURE}}) {
                Request request = new Request("https://localhost", resources);
                owner.request(request);
                assertEquals(1, request.denials);
            }
            owner.close();
            for (String document : Arrays.asList("https://external.invalid/", "http://localhost/", "https://localhost/wallet.html", "https://localhost/?remote=true")) {
                NativeMediaPermissions other = new NativeMediaPermissions(() -> document, prompt);
                Request request = audio();
                other.request(request);
                assertEquals(1, request.denials);
                other.close();
            }
            assertEquals(0, prompt.launches);
        });
    }

    @Test public void grantsOnlyRequestedKnownResourcesWhenOsActuallyAuthorizesThem() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Prompt prompt = new Prompt();
            prompt.granted = true;
            NativeMediaPermissions owner = new NativeMediaPermissions(() -> "https://localhost/index.html#conversas", prompt);
            Request request = audio();
            owner.request(request);
            assertArrayEquals(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE}, request.approved);
            assertEquals(1, request.grants);
            assertEquals(0, prompt.launches);
            owner.close();
        });
    }

    @Test public void canceledOsResultCannotAuthorizeAnotherPendingRequest() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Prompt prompt = new Prompt();
            NativeMediaPermissions owner = new NativeMediaPermissions(() -> "https://localhost/#conversas", prompt);
            Request first = audio();
            owner.request(first);
            assertArrayEquals(new String[] {Manifest.permission.RECORD_AUDIO}, prompt.requested);
            assertEquals(1, prompt.launches);
            owner.cancel(first);
            Request second = audio();
            owner.request(second);
            assertEquals(1, second.denials);
            prompt.granted = true;
            owner.permissionResult();
            assertEquals(0, first.grants);
            assertEquals(0, second.grants);
            Request third = audio();
            owner.request(third);
            assertEquals(1, third.grants);
            owner.close();
        });
    }

    @Test public void navigationOsDenialAndDisposalFailClosed() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            Prompt prompt = new Prompt();
            String[] document = {"https://localhost/"};
            NativeMediaPermissions owner = new NativeMediaPermissions(() -> document[0], prompt);
            Request denied = audio();
            owner.request(denied);
            owner.permissionResult();
            assertEquals(1, denied.denials);
            Request navigating = audio();
            owner.request(navigating);
            document[0] = "https://external.invalid/";
            owner.onPageStarted(null);
            assertEquals(1, navigating.denials);
            prompt.granted = true;
            owner.permissionResult();
            assertEquals(0, navigating.grants);
            owner.close();
            assertTrue(prompt.closed);
            Request closed = audio();
            owner.request(closed);
            assertEquals(1, closed.denials);
        });
    }
}
