pipeline {
  agent any

  environment {
    IMAGE_NAME   = "isurangiguniyangodage/hd-app"   // change to your Docker Hub repo
    IMAGE_TAG    = "${env.BUILD_NUMBER}"
    SONAR_SERVER = "sonarqube"              // Jenkins → System → SonarQube servers
    SONAR_TOKEN  = credentials('sonar-token')
  }

  options {
    skipDefaultCheckout(true)
    timestamps()
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build') {
      steps {
        script {
          bat 'node -v'
          bat 'npm ci'
          bat 'npm run build || echo no build step'
        }
      }
    }

    stage('Test') {
      steps {
        script {
          bat 'npm test'
        }
      }
      post {
        always {
          junit 'reports/junit.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

   stage('Code Quality (Sonar)') {
  environment {
    SONAR_TOKEN = credentials('sonar-token')   // <-- Your stored Jenkins credential
  }
  steps {
    withSonarQubeEnv("${SONAR_SERVER}") {
      script {
        if (isUnix()) {
          sh '''
            [ -f coverage/lcov.info ] || echo "No lcov found (ok)"
            sonar-scanner -Dsonar.login=$SONAR_TOKEN
          '''
        } else {
          bat '''
            if not exist coverage\\lcov.info echo No lcov found (ok)
            sonar-scanner -D"sonar.login=%SONAR_TOKEN%"
          '''
        }
      }
    }
  }
}


    stage('Quality Gate') {
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Docker Build & Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
          bat '''
            docker build -t %IMAGE_NAME%:%IMAGE_TAG% .
            echo %DOCKER_PASS% | docker login -u %DOCKER_USER% --password-stdin
            docker tag %IMAGE_NAME%:%IMAGE_TAG% %IMAGE_NAME%:latest
            docker push %IMAGE_NAME%:%IMAGE_TAG%
            docker push %IMAGE_NAME%:latest
          '''
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'Dockerfile,docker-compose.yml,sonar-project.properties', allowEmptyArchive: true
    }
  }
}
