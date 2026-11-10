package app.zeroxdmme.development.session;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.ViewGroup.LayoutParams;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import app.zeroxdmme.development.R;

/** Full-screen chrome and scrollable content, hosted only in the secure dialog. */
final class NativeViewOnceLayout extends LinearLayout {
    private static final int BACKGROUND = 0xff0e121a;
    private static final int GLOW = 0xff243354;
    private static final int INK = 0xfff0f4ff;
    private static final int MUTED = 0xffadb9d1;
    private static final int ACCENT = 0xffa9c3ff;
    private final GradientDrawable backdrop = new GradientDrawable();
    private final ScrollView scroll;
    private final LinearLayout body;
    private ImageView photo;
    private boolean hasCaption;

    NativeViewOnceLayout(Context context, Runnable close) {
        super(context);
        setOrientation(VERTICAL);
        backdrop.setColors(new int[] {GLOW, BACKGROUND});
        backdrop.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        backdrop.setGradientCenter(0.5f, 0.39f);
        setBackground(backdrop);

        FrameLayout header = new FrameLayout(context);
        addView(header, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(56)));
        LinearLayout title = new LinearLayout(context);
        title.setGravity(Gravity.CENTER);
        TextView badge = label("1", 11, ACCENT);
        GradientDrawable ring = rounded(Color.TRANSPARENT, 10);
        ring.setStroke(dp(1), ACCENT, dp(2), dp(2));
        badge.setBackground(ring);
        badge.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        title.addView(badge, new LinearLayout.LayoutParams(dp(19), dp(19)));
        TextView name = label("View-once message", 14, INK);
        name.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams nameSize = new LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
        nameSize.setMarginStart(dp(7));
        title.addView(name, nameSize);
        FrameLayout.LayoutParams titleSize = new FrameLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.MATCH_PARENT, Gravity.CENTER);
        titleSize.setMargins(dp(52), 0, dp(52), 0);
        header.addView(title, titleSize);

        ImageButton back = new ImageButton(context);
        back.setContentDescription("Close view-once message");
        back.setImageResource(R.drawable.view_once_back);
        back.setColorFilter(INK);
        back.setBackground(rounded(BACKGROUND, 24));
        back.setOnClickListener(button -> close.run());
        FrameLayout.LayoutParams backSize = new FrameLayout.LayoutParams(dp(48), dp(48), Gravity.START | Gravity.CENTER_VERTICAL);
        backSize.setMarginStart(dp(12));
        header.addView(back, backSize);

        scroll = new ScrollView(context);
        scroll.setFillViewport(true);
        scroll.setClipToPadding(false);
        scroll.setPadding(dp(16), 0, dp(16), 0);
        body = new LinearLayout(context);
        body.setOrientation(VERTICAL);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(12), 0, dp(12));
        scroll.addView(body, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        addView(scroll, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, 0, 1));
        scroll.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> sizePhoto());
        body.addView(label("Loading…", 16, MUTED));

        LinearLayout footer = new LinearLayout(context);
        footer.setGravity(Gravity.CENTER);
        ImageView lock = new ImageView(context);
        lock.setImageResource(R.drawable.view_once_lock);
        lock.setColorFilter(MUTED);
        lock.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        footer.addView(lock, new LinearLayout.LayoutParams(dp(16), dp(16)));
        TextView hint = label("Available until you close.", 12, MUTED);
        LinearLayout.LayoutParams hintSize = new LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
        hintSize.setMarginStart(dp(6));
        footer.addView(hint, hintSize);
        addView(footer, new LinearLayout.LayoutParams(LayoutParams.MATCH_PARENT, dp(48)));
    }

    @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
        super.onSizeChanged(width, height, oldWidth, oldHeight);
        backdrop.setGradientRadius(Math.max(1, Math.max(width, height) * 0.65f));
    }

    void show(Bitmap bitmap, String text) {
        erase();
        if (bitmap != null) {
            photo = new ImageView(getContext());
            hasCaption = !text.isEmpty();
            photo.setContentDescription("View-once image");
            photo.setImageBitmap(bitmap);
            photo.setScaleType(ImageView.ScaleType.FIT_CENTER);
            photo.setBackground(rounded(BACKGROUND, 14));
            photo.setClipToOutline(true);
            body.addView(photo, new LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT));
            // Keep tall photos inside the viewport while long captions can scroll.
            sizePhoto();
        }
        if (!text.isEmpty()) {
            TextView message = label(text, bitmap == null ? 22 : 16, bitmap == null ? INK : MUTED);
            message.setMaxWidth(dp(bitmap == null ? 360 : 540));
            message.setLineSpacing(dp(3), 1);
            message.setTextIsSelectable(false);
            message.setLongClickable(false);
            LinearLayout.LayoutParams size = new LinearLayout.LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
            if (bitmap != null) size.topMargin = dp(10);
            body.addView(message, size);
        }
    }

    void erase() {
        if (photo != null) photo.setImageDrawable(null);
        photo = null;
        hasCaption = false;
        body.removeAllViews();
    }

    private void sizePhoto() {
        if (photo == null) return;
        int imageWidth = photo.getDrawable().getIntrinsicWidth();
        int imageHeight = photo.getDrawable().getIntrinsicHeight();
        int width = scroll.getWidth() - scroll.getPaddingLeft() - scroll.getPaddingRight();
        int height = scroll.getHeight() - dp(24);
        if (width <= 0 || height <= 0) return;
        float scale = Math.min(Math.min(width, dp(680)) / (float) imageWidth,
            height * (hasCaption ? 0.72f : 1f) / imageHeight);
        int fitWidth = Math.max(1, Math.round(imageWidth * scale));
        int fitHeight = Math.max(1, Math.round(imageHeight * scale));
        if (photo.getLayoutParams().width != fitWidth || photo.getLayoutParams().height != fitHeight)
            photo.setLayoutParams(new LinearLayout.LayoutParams(fitWidth, fitHeight));
    }

    private TextView label(String value, int size, int color) {
        TextView label = new TextView(getContext());
        label.setText(value);
        label.setTextSize(size);
        label.setTextColor(color);
        label.setGravity(Gravity.CENTER);
        return label;
    }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable result = new GradientDrawable();
        result.setColor(color);
        result.setCornerRadius(dp(radius));
        return result;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
