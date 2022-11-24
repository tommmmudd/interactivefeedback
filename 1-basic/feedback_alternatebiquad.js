console.clear();
// use compressor here for dynamics
// https://riptutorial.com/web-audio

let audioContext = new (window.AudioContext || window.webkitAudioContext)();



// Moog filter based on Noise Hack implementation:
// https://noisehack.com/custom-audio-effects-javascript-web-audio-api/
// from musicdsp example: 
// http://www.musicdsp.org/showArchiveComment.php?ArchiveID=26
class Moog {

  constructor(context)
  {
    let bufferSize = 256;
    this.in1, this.in2, this.in3, this.in4, this.out1, this.out2, this.out3, this.out4;
    this.in1 = 0; this.in2 = 0; this.in3 = 0; this.in4 = 0;  this.out1 = 0; this.out2 = 0; this.out3 =  0;this.out4 = 0.0;
    
    this.processor = context.createScriptProcessor(bufferSize, 2, 2);
    this.cutoff = 660; // NOT between 0.0 and 1.0, now between 20-20000
    this.resonance = 1.99; // between 0.0 and 4.0

    this.targetFreq = this.cutoff;
    this.transitionTimeInSamples = 1500;
    this.transitionFreq = this.cutoff;
    this.transitionCounter = this.transitionTimeInSamples;

    this.processor.onaudioprocess = function(e) 
    {
      var input = e.inputBuffer.getChannelData(0);
      var outputL = e.outputBuffer.getChannelData(0);
      var outputR = e.outputBuffer.getChannelData(1);

      var f = (2 * this.cutoff / e.inputBuffer.sampleRate) * 1.16;
      var fb = this.resonance * (1.0 - 0.15 * f * f);

      //console.log(this.in1);
      
      for (var i = 0; i < e.outputBuffer.length; i++) 
      {
        if (this.transitionCounter < this.transitionTimeInSamples)
        {
          this.cutoff += (this.targetFreq - this.transitionFreq) / this.transitionTimeInSamples;
          this.transitionCounter += 1;
        }
        input[i] -= this.out4 * fb;
        input[i] *= 0.35013 * (f*f)*(f*f);
        this.out1 = input[i] + 0.3 * this.in1 + (1 - f) * this.out1; // Pole 1
        this.in1 = input[i];
        this.out2 = this.out1 + 0.3 * this.in2 + (1 - f) * this.out2; // Pole 2
        this.in2 = this.out1;
        this.out3 = this.out2 + 0.3 * this.in3 + (1 - f) * this.out3; // Pole 3
        this.in3 = this.out2;
        this.out4 = this.out3 + 0.3 * this.in4 + (1 - f) * this.out4; // Pole 4
        this.in4 = this.out3;
        outputL[i] = this.out4;
        outputR[i] = this.out4;
      }
    }.bind(this)
  }
    
  setFreq(newFreq)  { this.targetFreq = newFreq; this.transitionFreq = this.cutoff; this.transitionCounter = 0; }
  get input()   {     return this.processor;        }

  connect(node) {    this.processor.connect(node);  }
}


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

  canvasCtx.fillStyle = 'rgb(239, 239, 239)';//  - this is #efefef?
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  var barWidth = (canvas.width / bufferToUse) * 2.5;
  var barHeight;
  var x = 0;
  for(var i = 0; i < bufferToUse; i++) 
  {
    barHeight = dataArray[i]/2;
    barHeight = barHeight / 150.0;
    barHeight *= barHeight*barHeight;
    barHeight *= 75

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
delay.delayTime.value = 0.0001; // set to 5 milliseconds

var moogFilter = new Moog(audioContext);

/*var biquadFilter = audioContext.createBiquadFilter();
biquadFilter.type = "bandpass";
//biquadFilter.frequency = 400;
biquadFilter.Q.value = 1.8;
biquadFilter.gain.value = 2;
*/

var compressor = audioContext.createDynamicsCompressor();
compressor.threshold.value = -10;
compressor.knee.value = 0;
compressor.ratio.value = 1.5;
compressor.reduction.value = -20;
compressor.attack.value = 0;
compressor.release.value = 0.2;

let feedback = audioContext.createGain();
feedback.gain.value = 1;

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
delay.connect(moogFilter.input);
//biquadFilter.connect(compressor);
moogFilter.connect(compressor);
compressor.connect(feedback);
compressor.connect(delay);
feedback.connect(delay);
//biquadFilter.connect(masterGain);
moogFilter.connect(masterGain)
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
  var newFreq = ((this.value * this.value) * 2534.0) + 220.0;
  moogFilter.setFreq(newFreq);  
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
    powerButton.innerHTML = "Turn Audio On";
    powerButton.style.background = "#efefef";
  } else if (this.dataset.power === 'off') {
    audioContext.resume();
    this.dataset.power = 'on';
    envelope.trigger();
    console.log("switching on");
    powerButton.innerHTML = "Turn Audio Off";
    powerButton.style.background = "#4CCF90";
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