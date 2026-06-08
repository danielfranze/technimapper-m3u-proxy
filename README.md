# TechniSat M3U Mapper

A lightweight abstraction proxy that stabilizes shifting TechniSat UPnP streams into a permanent, static M3U playlist tailored exclusively for Dispatcharr.

## The Problem: Dynamic Stream Instability
Hardware receivers like the TechniSat DIGIT ISIO STC generate live TV streams locally, but they suffer from a major design flaw for automated homelab setups: The Twonky UPnP server on these devices constantly changes the internal stream URLs and dynamic session parameters (e.g., after channel rescans, background updates, or simple device reboots).

If you link these raw URLs directly into automated IPTV tools like Dispatcharr, your setup will constantly break. The old URLs point to dead ends as soon as the receiver refreshes its internal state, effectively destroying your channel mappings.

### The Solution: TechniSat M3U Mapper
Note: This tool is specifically designed and tested for the TechniSat DIGIT ISIO STC. Other TechniSat receiver models have not been tested and are currently not officially supported.

The TechniSat M3U Mapper acts as a smart abstraction layer to solve this exact headache:

Dynamic Synchronization: It runs a background cron engine to constantly crawl the receiver's shifting UPnP structure and fetches the latest, currently valid stream URLs.

Static Mapping: It maps these volatile, constantly changing URLs to permanent, static Channel IDs that you define once via the Web UI.

Persistent Playlist: It serves a consistent, unchanging M3U playlist. Dispatcharr only talks to this Mapper, meaning your configuration stays 100% stable. Your setup will never break again, even when the receiver shuffles its internal URL parameters.

## Targeted Integration
This tool is **specifically built and optimized to be utilized exclusively in tandem with Dispatcharr**. It serves as the dedicated translation bridge, eliminating formatting mismatches and URL instability natively, feeding your TechniSat tuner streams reliably into your automated **Dispatcharr** pipeline.

![TechniSat M3U Mapper Web UI](assets/screenshot.png)

## Prerequisites

⚠️ **Crucial Step:** Before running this tool, you **must have a valid, fully configured TV channel list** set up directly on your receiver (specifically tested on the *TechniSat DIGIT ISIO STC*). If no internal channel list exists on the hardware, the UPnP directory tree will remain empty, and the mapper won't be able to discover any streams.

![TechniSat M3U Mapper Web UI](assets/screenshot_vlc.png)

## Docker Deployment

To ensure maximum stability and persistent storage of your mapped channel configurations, deploy the mapper using Docker Compose.

## Quick Start & Deployment

You can deploy this stack instantly. Choose the method that best fits your environment:

### Option A: Portainer Stack / Web UI (Recommended for Easy Setup)
Perfect for headless servers. You do not need to clone anything or touch the command line:

1. Open your **Portainer** dashboard.
2. Navigate to **Stacks** -> **Add stack**.
3. Give it a name (e.g., `technisat-m3u-mapper`).
4. Select the **Web editor** and paste the following configuration:

```yaml
version: '3.8'

services:
  technisat-m3u-mapper:
    image: ghcr.io/danielfranze/technisat-m3u-mapper:latest
    container_name: technisat-m3u-mapper
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - /etc/localtime:/etc/localtime:ro
    environment:
      - TZ=Europe/Berlin
    restart: unless-stopped
```

### Option B: Docker CLI Run (Ultra-Quick Terminal Start)
If you just want to fire up the container instantly via SSH/Terminal without using Compose or Portainer, run this standard command:

```bash
docker pull ghcr.io/danielfranze/technisat-m3u-mapper:latest
```
```bash
docker run -d \
  -p 3000:3000 \
  --name technisat-m3u-mapper \
  -v ./data:/app/data \
  --restart unless-stopped \
  ghcr.io/danielfranze/technisat-m3u-mapper:latest
  ```

## License

This project is open-source software licensed under the [MIT License](LICENSE.md). Feel free to use, modify, and distribute it.