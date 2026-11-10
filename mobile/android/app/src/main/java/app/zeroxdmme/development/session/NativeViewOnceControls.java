package app.zeroxdmme.development.session;

import android.content.Context;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import app.zeroxdmme.development.R;
import java.util.Locale;

/** Playback controls only; media stays in the capture-protected surface. */
final class NativeViewOnceControls extends LinearLayout {
    private final SeekBar timeline;
    private final TextView time;
    private final ImageButton play;
    private final ImageButton expand;
    private boolean dragging;
    private NativeViewOnceVideo video;

    NativeViewOnceControls(Context context, Runnable fullscreen) {
        super(context);
        setOrientation(VERTICAL);
        setPadding(dp(8), dp(2), dp(8), dp(4));
        setBackgroundColor(0xe60e121a);
        timeline = new SeekBar(context);
        timeline.setContentDescription("Video position");
        timeline.setEnabled(false);
        addView(timeline, new LayoutParams(LayoutParams.MATCH_PARENT, dp(32)));
        LinearLayout buttons = new LinearLayout(context);
        buttons.setGravity(Gravity.CENTER_VERTICAL);
        addView(buttons, new LayoutParams(LayoutParams.MATCH_PARENT, dp(44)));
        time = new TextView(context);
        time.setTextColor(Color.WHITE);
        time.setTextSize(12);
        time.setText("0:00 / 0:00");
        buttons.addView(time, new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1));
        ImageButton back = button(android.R.drawable.ic_media_rew, "Back 10 seconds");
        back.setOnClickListener(view -> { if (video != null) video.skip(-10_000); });
        buttons.addView(back);
        play = button(android.R.drawable.ic_media_play, "Play video");
        play.setEnabled(false);
        play.setOnClickListener(view -> { if (video != null) video.toggle(); });
        buttons.addView(play);
        ImageButton forward = button(android.R.drawable.ic_media_ff, "Forward 10 seconds");
        forward.setOnClickListener(view -> { if (video != null) video.skip(10_000); });
        buttons.addView(forward);
        expand = button(R.drawable.view_once_expand, "Full screen");
        expand.setOnClickListener(view -> fullscreen.run());
        buttons.addView(expand);
        timeline.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar, int progress, boolean user) {
                if (user) time.setText(format(progress) + " / " + format(bar.getMax()));
            }
            @Override public void onStartTrackingTouch(SeekBar bar) { dragging = true; }
            @Override public void onStopTrackingTouch(SeekBar bar) {
                dragging = false;
                if (video != null) video.seek(bar.getProgress());
            }
        });
    }

    void bind(NativeViewOnceVideo video) { this.video = video; }

    void update(int position, int duration) {
        timeline.setEnabled(duration > 0);
        timeline.setMax(Math.max(1, duration));
        if (!dragging) {
            timeline.setProgress(position);
            time.setText(format(position) + " / " + format(duration));
        }
    }

    void playing(boolean playing) {
        play.setEnabled(true);
        play.setImageResource(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        play.setContentDescription(playing ? "Pause video" : "Play video");
    }

    void fullscreen(boolean active) {
        expand.setImageResource(active ? R.drawable.view_once_collapse : R.drawable.view_once_expand);
        expand.setContentDescription(active ? "Exit full screen" : "Full screen");
    }

    void clear() { video = null; }

    private ImageButton button(int image, String label) {
        ImageButton button = new ImageButton(getContext());
        button.setImageResource(image);
        button.setColorFilter(Color.WHITE);
        button.setBackgroundColor(Color.TRANSPARENT);
        button.setContentDescription(label);
        button.setLayoutParams(new LayoutParams(dp(44), dp(44)));
        return button;
    }

    private static String format(int milliseconds) {
        int seconds = Math.max(0, milliseconds / 1000);
        return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
