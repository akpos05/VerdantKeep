// Emberfall: static checks, then build the AMD64 image, then scan it.
//
// Every tool runs in its own container, pinned by digest, so the Jenkins
// controller only needs Docker. Jenkins itself runs in a container here, and
// the docker agent shares its workspace with the tool containers through
// --volumes-from, which is why the tools run as `agent { docker }` and not
// as plain `docker run -v $WORKSPACE:...`.
pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        IMAGE_NAME = 'akpos05/embers'
        IMAGE_PLATFORM = 'linux/amd64'
        IMAGE_TAR = 'emberfall-image.tar'
    }

    stages {
        // ---- Before the build: fail fast on problems in the repo itself ----
        stage('Static checks') {
            parallel {
                stage('Secrets: gitleaks') {
                    agent {
                        docker {
                            image 'zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f'
                            args '--entrypoint='
                            reuseNode true
                        }
                    }
                    steps {
                        // Scans every commit in the history, not just the current files.
                        sh '''
                            mkdir -p reports
                            gitleaks git --redact --verbose --no-banner \
                                --report-format json --report-path reports/gitleaks.json .
                        '''
                    }
                }

                stage('Lint: JavaScript') {
                    agent {
                        docker {
                            image 'node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53'
                            reuseNode true
                        }
                    }
                    steps {
                        sh 'npm ci --no-audit --no-fund'
                        sh 'npm run lint'
                    }
                }

                stage('File references') {
                    agent {
                        docker {
                            image 'node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53'
                            reuseNode true
                        }
                    }
                    steps {
                        // Plain Node, no npm packages needed.
                        sh 'node ci/check-references.mjs'
                    }
                }

                stage('Lint: Dockerfile') {
                    agent {
                        docker {
                            image 'hadolint/hadolint:v2.15.1-alpine@sha256:a1d49ae1a4e83c1dbad26b8c1ad7588c8bd1e04f4866b34ad3cac50335198552'
                            reuseNode true
                        }
                    }
                    steps {
                        // Picks up .hadolint.yaml from the repo root.
                        sh 'hadolint Dockerfile'
                    }
                }
            }
        }

        stage('Build Image') {
            steps {
                // Tag with the build number for traceability, plus latest.
                // --pull picks up base image security rebuilds.
                sh '''
                    docker build --pull --platform "$IMAGE_PLATFORM" \
                        -t "$IMAGE_NAME:$BUILD_NUMBER" -t "$IMAGE_NAME:latest" .
                '''
                // The image only ships to AMD64 hosts, so a wrong architecture is a hard failure.
                sh '''
                    arch=$(docker image inspect "$IMAGE_NAME:$BUILD_NUMBER" --format '{{.Os}}/{{.Architecture}}')
                    echo "Built image platform: $arch"
                    test "$arch" = "$IMAGE_PLATFORM"
                '''
                // Trivy reads the image from a tarball, so it needs no access to the Docker socket.
                sh 'docker save "$IMAGE_NAME:$BUILD_NUMBER" -o "$IMAGE_TAR"'
            }
        }

        // ---- After the build: scan what will actually ship ----
        stage('Image scan: Trivy') {
            agent {
                docker {
                    image 'aquasec/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa'
                    args '--entrypoint='
                    reuseNode true
                }
            }
            environment {
                // Under JENKINS_HOME so the vulnerability DB is reused between builds.
                TRIVY_CACHE_DIR = "${env.JENKINS_HOME}/caches/trivy"
                TRIVY_NO_PROGRESS = 'true'
            }
            steps {
                // 1. Full report: HIGH and CRITICAL, shown in the log and archived. Never fails.
                sh '''
                    mkdir -p reports
                    trivy image --input "$IMAGE_TAR" --scanners vuln,secret \
                        --severity HIGH,CRITICAL --ignore-unfixed --exit-code 0
                    trivy image --input "$IMAGE_TAR" --scanners vuln,secret --skip-db-update \
                        --format json --output reports/trivy.json --exit-code 0
                '''
                // 2. Gate: fail the build on CRITICAL issues that already have a fix.
                sh '''
                    trivy image --input "$IMAGE_TAR" --scanners vuln,secret --skip-db-update \
                        --severity CRITICAL --ignore-unfixed --exit-code 1 --quiet
                '''
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
            sh 'rm -f "$IMAGE_TAR"'
        }
    }
}
