package app.zeroxdmme.development.session;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import app.zeroxdmme.development.R;
import java.util.Locale;
import java.util.function.IntConsumer;

/** Native controls stay inside the player's window, including secure windows. */
final class NativeVideoControls extends LinearLayout {
    private final ImageButton play;
    private final SeekBar seek;
    private final TextView clock;
    private boolean dragging;
    NativeVideoControls(Context context, Runnable toggle, IntConsumer position, Runnable fullscreen) {
        super(context);
        setGravity(Gravity.CENTER_VERTICAL);
        setPadding(dp(4), dp(4), dp(4), dp(4));
        setBackgroundColor(0xcc000000);
        play = button(android.R.drawable.ic_media_play, R.string.video_play, toggle);
        clock = new TextView(context);
        clock.setTextColor(Color.WHITE);
        clock.setTextSize(11);
        clock.setText("0:00 / 0:00");
        addView(clock);
        seek = new SeekBar(context);
        seek.setMax(1000);
        seek.setProgressTintList(ColorStateList.valueOf(0xffa9c3ff));
        seek.setThumbTintList(ColorStateList.valueOf(0xffa9c3ff));
        seek.setContentDescription(context.getString(R.string.video_seek));
        addView(seek, new LinearLayout.LayoutParams(0, dp(48), 1));
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onStartTrackingTouch(SeekBar bar) { dragging = true; }
            @Override public void onStopTrackingTouch(SeekBar bar) { dragging = false; position.accept(bar.getProgress()); }
            @Override public void onProgressChanged(SeekBar bar, int value, boolean user) {}
        });
        button(R.drawable.video_fullscreen, R.string.video_fullscreen, fullscreen);
        setEnabled(false);
    }
    private ImageButton button(int icon, int label, Runnable action) {
        ImageButton button = new ImageButton(getContext());
        button.setImageResource(icon);
        button.setColorFilter(Color.WHITE);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setContentDescription(getContext().getString(label));
        button.setOnClickListener(view -> action.run());
        addView(button, new LinearLayout.LayoutParams(dp(48), dp(48)));
        return button;
    }
    void update(boolean playing, int position, int duration) {
        play.setImageResource(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        play.setContentDescription(getContext().getString(playing ? R.string.video_pause : R.string.video_play));
        clock.setText(time(position) + " / " + time(duration));
        if (!dragging) seek.setProgress(duration > 0 ? (int) (1000L * position / duration) : 0);
    }
    @Override public void setEnabled(boolean enabled) {
        super.setEnabled(enabled);
        for (int i = 0; i < getChildCount(); i++) getChildAt(i).setEnabled(enabled);
    }
    private static String time(int ms) {
        int seconds = Math.max(0, ms / 1000);
        return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
