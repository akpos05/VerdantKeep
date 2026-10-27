// Emberfall: build the Docker image only. Test and delivery stages come later.
pipeline {
    agent any

    environment {
        IMAGE_NAME = 'akpos05/embers'
    }

    stages {
        stage('Checkout') {
            steps {
                git url: 'https://github.com/akpos05/VerdantKeep.git', branch: 'main'
            }
        }

        stage('Build Image') {
            steps {
                // Tag with the build number for traceability, plus latest.
                sh 'docker build -t $IMAGE_NAME:$BUILD_NUMBER -t $IMAGE_NAME:latest .'
            }
        }
    }
}
