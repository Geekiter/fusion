# Fusion media egress on TX

`fusion-image-egress.service` runs a separate Mihomo process for Fusion on the
private Docker bridge address `172.20.0.1:17892`. It has its own configuration,
state directory, and fallback group. Its health check requests an Imgur image.
The main Clash subscription, refresh jobs, configuration, and controller remain
independent.

Create the private configuration by copying selected nodes from an existing
configuration, in preferred order:

```sh
sudo install -d -m 0750 -o root -g ubuntu /etc/fusion-image-egress
sudo python3 deploy/create-fusion-image-egress.py \
  /etc/clash/config.yaml /etc/fusion-image-egress/config.yaml \
  "preferred-node-name" "fallback-node-name"
sudo chown root:ubuntu /etc/fusion-image-egress/config.yaml
sudo chmod 0640 /etc/fusion-image-egress/config.yaml
sudo install -d -m 0700 -o ubuntu -g ubuntu /var/lib/fusion-image-egress
sudo -u ubuntu /usr/local/bin/clash -t \
  -d /var/lib/fusion-image-egress -f /etc/fusion-image-egress/config.yaml
sudo install -m 0644 deploy/fusion-image-egress.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fusion-image-egress.service
```

The generator reads the source once and never changes it. Credentials stay in
the protected destination file; do not commit or print that file. When selected
node credentials expire, regenerate this dedicated file and restart the service.
The host needs Python 3 with PyYAML and the existing Mihomo binary at
`/usr/local/bin/clash`.

Apply `fusion-image-routing.env` to the Fusion container environment and recreate
only Fusion. Keep the existing password, volumes, network, and other settings.
The direct host list avoids unnecessary overseas routing for verified image
hosts. `mm.chenkeyan.com` must remain in `NO_PROXY` for OAuth token exchange.

The older `fusion-proxy.socket` and `fusion-proxy.service` relay through the main
proxy at port 7890. They are retained as a rollback option and should be stopped
and disabled once Fusion uses the dedicated process.
