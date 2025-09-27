pipeline {
  agent any

  environment {
    IMAGE_NAME   = "isurangiguniyangodage/hd-app"
    IMAGE_TAG    = "${env.BUILD_NUMBER}"
    DOCKER_CREDS = 'dockerhub-creds'
    SONAR_SERVER = "sonarqube"
    SONAR_TOKEN  = credentials('sonar-token')
    APP_HEALTH_URL_STAGING = "http://localhost:9090/health"
    APP_HEALTH_URL_PROD    = "http://localhost:9090/health"
  }

  options {
    skipDefaultCheckout(true)
    timestamps()
  }

  stages {

    // (4) Build
    stage('Build') {
      steps {
        script {
          checkout scm
          bat 'node -v'
          bat 'npm ci'
          bat 'npm run build || echo no build step'
        }
      }
    }

    // (5) Test
    stage('Test') {
      steps {
        script { bat 'npm test' }
      }
      post {
        always {
          junit 'reports/junit.xml'
          archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
        }
      }
    }

    // (6) Code Quality
    stage('Code Quality') {
      steps {
        withSonarQubeEnv("${SONAR_SERVER}") {
          bat '''
            if not exist coverage\\lcov.info echo No lcov found (ok)
            sonar-scanner ^
              -Dsonar.projectKey=hd-app ^
              -Dsonar.sources=. ^
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/** ^
              -Dsonar.tests=_tests_ ^
              -Dsonar.test.inclusions=_tests_/**/*.js ^
              -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
          '''
        }
      }
    }

    // (7) Security Scan
    stage('Security Scan') {
      steps {
        script {
          // use dockerized Trivy (works even if not installed on Jenkins agent)
          bat """
            docker run --rm ^
              -v "%cd%:/repo" ^
              aquasec/trivy:latest fs --no-progress --severity HIGH,CRITICAL --exit-code 1 /repo
          """
        }
      }
    }

    // (8) Deploy to Staging
    stage('Deploy to Staging') {
      steps {
        script {
          writeFile file: '.env.staging', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=dev-key
"""
          bat """
            docker-compose --env-file .env.staging up -d
            timeout /t 5 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_STAGING}').StatusCode } catch { exit 1 }"
          """
        }
      }
    }

    // (9) Release → manual promotion to production
    stage('Release: Promote to Production') {
      steps {
        input message: "Promote image ${IMAGE_NAME}:${IMAGE_TAG} to PRODUCTION?"
      }
    }

    stage('Deploy to Production') {
      steps {
        script {
          writeFile file: '.env.prod', text: """IMAGE_NAME=${env.IMAGE_NAME}
IMAGE_TAG=${env.IMAGE_TAG}
NODE_ENV=production
API_KEY=prod-key
"""
          bat """
            docker-compose --env-file .env.prod up -d
            timeout /t 5 >NUL
          """
          bat """
            powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { exit 1 }"
          """
        }
      }
    }

    // (10) Monitoring
    stage('Monitoring') {
      steps {
        bat """powershell -Command "try { (Invoke-WebRequest -UseBasicParsing '${APP_HEALTH_URL_PROD}').StatusCode } catch { 'ERR' }" """
      }
    }
  }

  post {
    success { echo "✅ Pipeline completed successfully" }
    failure { echo "❌ Pipeline failed" }
    always {
      archiveArtifacts artifacts: 'Dockerfile,docker-compose*.yml,sonar-project.properties,.env.*', allowEmptyArchive: true
    }
  }
}
