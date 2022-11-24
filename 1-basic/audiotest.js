console.clear();
// use compressor here for dynamics
// https://riptutorial.com/web-audio

let audioContext = new (window.AudioContext || window.webkitAudioContext)();

class WhiteNoise {
  constructor(context) {
    let blocksize = 256;
    let gain = 0.1;
  
    //Creating nodes
    this.processor = context.createScriptProcessor(blocksize, 2, 2);
    
    let self = this;
    this.processor.onaudioprocess = function(audioProcessingEvent) {
      let outputBuffer = audioProcessingEvent.outputBuffer;

      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        let outputData = outputBuffer.getChannelData(channel);

        for (let sample = 0; sample < outputBuffer.length; sample++) {
          // make output equal to the same as the input
          outputData[sample] = gain *(Math.random() - 0.5);
        }
      }
      
    }
  }
  
  connect(node) {
    this.processor.connect(node);
  }
  

};

var EnvelopeGenerator = (function(context) {
  function EnvelopeGenerator() {
    this.attackTime = 0.001;
    this.releaseTime = 0.1;
  };

  EnvelopeGenerator.prototype.trigger = function() {
    console.log("triggered!!");
    now = context.currentTime;
    this.param.cancelScheduledValues(now);
    this.param.setValueAtTime(0, now);
    this.param.linearRampToValueAtTime(1, now + this.attackTime);
    this.param.linearRampToValueAtTime(0, now + this.attackTime + this.releaseTime);
  };

  EnvelopeGenerator.prototype.connect = function(param) {
    this.param = param;
  };

  return EnvelopeGenerator;
})(audioContext);

class VCA {
  constructor(context) 
  {
    let blocksize = 256;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
  }
  
  get gainVal() {     return this.gain.gain;  }
  get input()   {     return this.gain;        }

  connect(node) {    this.gain.connect(node);  }
  

};

var analyser = audioContext.createAnalyser();
analyser.fftSize = 4096;
var bufferLength = analyser.frequencyBinCount;
var bufferToUse = bufferLength/6
console.log(bufferLength);
var dataArray = new Uint8Array(bufferToUse);

var canvas = document.querySelector('.visualizer');
var canvasCtx = canvas.getContext("2d");
//canvasCtx.fillStyle = 'rgb(200, 100, 50)';
//canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

function draw() {

  drawVisual = requestAnimationFrame(draw);

  analyser.getByteFrequencyData(dataArray);

  canvasCtx.fillStyle = 'rgb(255, 255, 255)';
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  var barWidth = (canvas.width / bufferToUse) * 2.5;
  var barHeight;
  var x = 0;
  for(var i = 0; i < bufferToUse; i++) 
  {
    barHeight = dataArray[i]/2;
    barHeight = barHeight / 150.0;
    barHeight *= barHeight*barHeight;
    barHeight *= 300

    canvasCtx.fillStyle = 'rgb(50,50,'+(barHeight+50)+')';
    canvasCtx.fillRect(x, canvas.height - barHeight/2, barWidth, barHeight);

    x += barWidth + 1;
  }
};

draw();



let whiteNoise = new WhiteNoise(audioContext);

let vca = new VCA(audioContext);
var envelope = new EnvelopeGenerator;



var delay = audioContext.createDelay(0.01);   // max delay time is 0.1 seconds
delay.delayTime.value = 0.005; // set to 5 milliseconds

var biquadFilter = audioContext.createBiquadFilter();
biquadFilter.type = "bandpass";
//biquadFilter.frequency = 400;
biquadFilter.Q.value = 1.8;
biquadFilter.gain.value = 2;

var compressor = audioContext.createDynamicsCompressor();
compressor.threshold.value = -10;
compressor.knee.value = 0;
compressor.ratio.value = 1.5;
compressor.reduction.value = -20;
compressor.attack.value = 0;
compressor.release.value = 0.2;

let feedback = audioContext.createGain();
feedback.gain.value = 0.1;

let masterGain = audioContext.createGain();
masterGain.gain.value = 0.25;

//let sourceNode = audioContext.createOscillator();
//sourceNode.type = 'sine';
//sourceNode.frequency.value = 261.6;
//sourceNode.detune.value = 0;

//Connect the source to the speakers
whiteNoise.connect(vca.input);
envelope.connect(vca.gainVal);
vca.connect(delay);
delay.connect(biquadFilter);
biquadFilter.connect(compressor);
compressor.connect(feedback);
compressor.connect(delay);
feedback.connect(delay);
biquadFilter.connect(masterGain);
masterGain.connect(audioContext.destination)
masterGain.connect(analyser);



//Make the sound audible for 100 ms
//whiteNoise.start();
//window.setTimeout(function() { sourceNode.stop(); }, 100);


// ENVELOPE BUTTON
/*
const envButton = document.querySelector(".env-trig");
envButton.onmousedown = function() { envelope.trigger(); console.log("pressed"); }
envButton.onmouseup = function() { console.log("released"); }
*/


// FREQUENCY SLIDER
const freqSlider = document.querySelector(".control-x");
freqSlider.addEventListener('input', function() 
{
  var newFreq = ((this.value * this.value) * 880.0) + 220.0;
  biquadFilter.frequency.setTargetAtTime(newFreq, audioContext.currentTime, 0.002);  
  //console.log ("freq: ", newFreq);
}, "false");

// RESONANCE SLIDER
/*
const reslider = document.querySelector(".control-q");
reslider.addEventListener('input', function() 
{
  var newRes = ((this.value * this.value) * 5.0) + 0.01;
  biquadFilter.Q.setTargetAtTime(newRes, audioContext.currentTime, 0.005);  
  console.log ("res: ", newRes);
}, "false");
*/



// POWER BUTTON
const powerButton = document.querySelector(".control-power");

if (powerButton)
{
	console.log("power button exists");
	powerButton.addEventListener('click', function() {
	if (this.dataset.power === 'on') {
		audioContext.suspend();
		this.dataset.power = 'off';
		console.log("switching off");
	} else if (this.dataset.power === 'off') {
		audioContext.resume();
		this.dataset.power = 'on';
    envelope.trigger();
		console.log("switching on");
	}
	this.setAttribute( "aria-checked", audioContext.state ? "false" : "true" );
	console.log(audioContext.state);
}, false);
}
else 
{
	console.log("power button dunt exist yet");
}

function switchOn() 
{
	audioContext.resume();
}