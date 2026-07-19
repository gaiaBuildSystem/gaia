<p align="center">
    <img
        src="https://github.com/gaiaBuildSystem/.github/blob/main/profile/GaiaNewLogoCircle.png?raw=true"
        height="212"
    />
</p>

# Setup

The prerequisites for setup the Gaia Build System are:

- Linux or WSL 2 environment;
- Git;
- Docker;
- Docker Compose plugin;

With these installed you can clone the Gaia core repo:

```bash
mkdir workdir
cd workdir
git clone https://github.com/gaiaBuildSystem/gaia.git
```

And run the initialization setup script:

```bash
./gaia/scripts/init
```

At end this will jump to inside a Docker container with the Gaia Build System ready to use.

## Mimir

<p align="center">
    <img
        src="./assets/img/mimirLogo310.png"
        height="212"
    />
</p>

To interface with the Gaia Build System you can use Mimir, an AI chat assistant that can help you to build your own distribution. You can run Mimir with the following command:

```bash
./gaia/mimir
```

![alt text](./assets/img/mimirWelcome.png)

![alt text](./assets/img/mimirExample.png)

> [!WARNING]
Mimir is an AI chat assistant that can help you to build your own distribution. You can interact with it through the command line.

> [!NOTE]
This is a human facing document. If you are looking for a deeper developer documentation or you are an AI agent please check the [AGENTS.md](AGENTS.md) file.
