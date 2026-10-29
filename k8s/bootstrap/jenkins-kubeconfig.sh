#!/bin/sh
# Prints a kubeconfig for the jenkins-deployer service account. Run it on the
# MicroK8s machine after applying jenkins-deployer.yaml, and keep the output
# private, since it holds the account's token:
#
#   (umask 077; sh k8s/bootstrap/jenkins-kubeconfig.sh > ~/jenkins-microk8s.kubeconfig)
set -eu

KUBECTL=${KUBECTL:-microk8s kubectl}
NAMESPACE=emberfall
# Jenkins runs in Docker Desktop, where the MicroK8s API is reachable through
# the Windows host. host.docker.internal is not in the API server certificate,
# so the certificate is checked against "kubernetes", which is.
SERVER=${SERVER:-https://host.docker.internal:16443}

secret_field() {
    $KUBECTL -n "$NAMESPACE" get secret jenkins-deployer-token -o "jsonpath={.data.$1}"
}

# Kubernetes fills in the token a moment after the secret is created.
token=''
for _ in 1 2 3 4 5 6 7 8 9 10; do
    token=$(secret_field token)
    [ -n "$token" ] && break
    sleep 1
done
if [ -z "$token" ]; then
    echo "jenkins-deployer-token has no token yet. Was jenkins-deployer.yaml applied?" >&2
    exit 1
fi
token=$(printf '%s' "$token" | base64 -d)
ca=$(secret_field 'ca\.crt')

cat <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: microk8s
    cluster:
      server: $SERVER
      certificate-authority-data: $ca
      tls-server-name: kubernetes
users:
  - name: jenkins-deployer
    user:
      token: $token
contexts:
  - name: jenkins-deployer@microk8s
    context:
      cluster: microk8s
      user: jenkins-deployer
      namespace: $NAMESPACE
current-context: jenkins-deployer@microk8s
EOF
