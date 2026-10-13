package dev.flurbo.preview;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.net.URISyntaxException;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        // The same passkeys as the website, including the PRF extension Mera needs. Checked again when signing in.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(webView.getSettings(), WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP);
        }
        // MetaMask links must leave this WebView. An intent:// address is ignored here unless it is parsed.
        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (openMetaMask(request.getUrl())) return true;
                return super.shouldOverrideUrlLoading(view, request);
            }
        });
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (getBridge() == null) return;
        Uri data = intent.getData();
        // A link into the site opens that page. A flurbo:// return from MetaMask only brings the app forward.
        if (data != null && "https".equals(data.getScheme()) && "flurbo.singu.online".equals(data.getHost())) {
            getBridge().getWebView().loadUrl(data.toString());
        }
    }

    private boolean openMetaMask(Uri url) {
        if (url == null || url.getScheme() == null) return false;
        String scheme = url.getScheme().toLowerCase();
        String host = url.getHost() == null ? "" : url.getHost().toLowerCase();
        boolean wallet = scheme.equals("intent") || scheme.equals("metamask") || scheme.equals("wc")
            || host.equals("metamask.app.link") || host.equals("link.metamask.io");
        if (!wallet) return false;
        String raw = url.toString();
        try {
            Intent intent = scheme.equals("intent") ? Intent.parseUri(raw, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, url);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
            intent.setPackage("io.metamask");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (URISyntaxException | ActivityNotFoundException ignored) {
            try {
                Uri browser = url;
                if (scheme.equals("intent")) {
                    Intent parsed = Intent.parseUri(raw, Intent.URI_INTENT_SCHEME);
                    String fallback = parsed.getStringExtra("browser_fallback_url");
                    if (fallback != null && fallback.startsWith("https://")) browser = Uri.parse(fallback);
                    else browser = Uri.parse("https://metamask.app.link/");
                } else if (scheme.equals("wc") || scheme.equals("metamask")) {
                    browser = Uri.parse("https://metamask.app.link/wc?uri=" + Uri.encode(raw));
                }
                Intent view = new Intent(Intent.ACTION_VIEW, browser);
                view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(view);
            } catch (URISyntaxException | ActivityNotFoundException ignoredAgain) {
                // MetaMask and the browser are both unavailable. Stay on the page.
            }
            return true;
        }
    }
}
