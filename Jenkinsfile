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
  environment { SONAR_TOKEN = credentials('sonar-token') }
  steps {
    withSonarQubeEnv("${SONAR_SERVER}") {
      bat '''
        if not exist coverage\\lcov.info echo No lcov found (ok)
        sonar-scanner ^
          -Dsonar.tests=_tests_ ^
          -Dsonar.test.inclusions=_tests_/**/*.js ^
          -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
      '''
    }
  }
}

    stage('Quality Gate') {
    steps {
        timeout(time: 10, unit: 'MINUTES') {
            script {
                def qg = waitForQualityGate()         // uses server from withSonarQubeEnv
                echo "Quality Gate status: ${qg.status}"
                if (qg.status in ['ERROR','FAILED']) {
                error "Pipeline aborted due to quality gate failure: ${qg.status}"
                }
        // OK, WARN, NONE -> continue
      }
    }
  }
}


    stage('Docker Build & Push') {
    steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-creds',
                                          usernameVariable: 'DOCKER_USER',
                                          passwordVariable: 'DOCKER_PASS')]) {
            bat """
                docker build -t ${DOCKER_USER}/hd-app:${BUILD_NUMBER} .
                echo %DOCKER_PASS% | docker login -u %DOCKER_USER% --password-stdin
                docker push ${DOCKER_USER}/hd-app:${BUILD_NUMBER}
                docker tag ${DOCKER_USER}/hd-app:${BUILD_NUMBER} ${DOCKER_USER}/hd-app:latest
                docker push ${DOCKER_USER}/hd-app:latest
            """
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
