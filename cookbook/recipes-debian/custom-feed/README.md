# Add a custom Debian feed to the system image

This recipe allows you to add a custom Debian feed to your system image. You can specify the feed URL, snapshot, and GPG key URL in the `customData` section of your machine's metadata:

```json
"customData": {
    "rpi5b": {
            "feeds": [
                {
                    "name": "custom-debian-feed",
                    "feedUrl": "custom-debian-feed.example.com",
                    "feedUri": "https://custom-debian-feed.example.com/debian",
                    "suites": "buster",
                    "components": "main contrib non-free",
                    "gpgKeyUrl": "https://custom-debian-feed.example.com/keys/debian-archive-keyring.gpg",
                    "pinPriority": 500
                }
            ]
        }
    },
```

Each machine should have the follow data structure:

```typescript
interface DebianFeedConfig {
    feeds?: [{
        name: string
        feedUrl: string
        feedUri: string
        suites: string
        components: string
        gpgKeyUrl: string
        pinPriority: number
    }]
}
```
